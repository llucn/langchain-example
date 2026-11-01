## Context

`apps/api/src/agent/agent.config.ts` exports the `AGENTS` registry (four definitions: model, `maxTokens`, `thinking`, `outputConfig`, `tools`, `systemPrompt`, plus a `version: 'v1'` hook) and global constants (`AGENT_MAX_CONTEXT_MESSAGES`, `AGENT_RECURSION_LIMIT`, `SELECTOR_MAX_TURNS`, `SELECTOR_MIN_CONFIDENCE`). They are imported directly by `AgentService`, `multi-agent.middleware`, `select-agent.tool`, `chat-log.service` and `agent.config-identity.ts`. MCP server URLs come from four env variables through `loadEnv` (`MCP_SERVER_ENV`; replaced by literal URLs in the config); model endpoint/key from `MODEL_BASE_URL`/`MODEL_API_KEY`.

The (not yet archived) `add-chat-logging-review` change already stores an `agent_config_snapshots` row per distinct definition (PK = SHA-256 of the canonical definition) and writes `agentConfigVersion` + `agentConfigHash` on each log message; its design anticipates "the identifier becomes the Git commit ID".

The Agent Config will live in a private GitHub repository, e.g. `https://github.com/llucn/config.git` with the files under `langchain-example/`. The API is a NestJS app (TypeORM/Postgres, Docker image) that must keep starting reliably and must stay testable offline.

## Goals / Non-Goals

**Goals:**
- Load agent definitions and agent parameters from a GitHub repo at a configurable ref (branch/tag/commit) on startup.
- Reproducible attribution: every run and chat log refers to `(CONFIG_REF, commit ID)`.
- Cache the parsed result in `agent_config_snapshots`, invalidated when the commit ID or the ref changes.
- Fail fast on missing/invalid config; degrade to the last good snapshot only when the repository is unreachable.
- Keep secrets out of URLs and logs; allow sensitive values in the (private) config.
- A ready-to-copy sample config (`docs/config-sample`) equal to today's hard-coded behaviour.

**Non-Goals:**
- Hot reload/polling of a mutable branch, webhooks, per-session pinning, A/B rollout of configs.
- A config editor UI, commit signature verification, multi-repo composition.
- Moving the model connection or MCP credentials out of the environment by default (optional override only).

## Decisions

### 1. GitHub REST API + tarball for fetching, not the `git` CLI

`CONFIG_SOURCE` = `<repo-url>[//<sub-path>]` (the first `//` after the scheme separates the sub-path, as in go-getter/Terraform), where `<repo-url>` is an HTTPS GitHub repository URL (`https://github.com/<owner>/<repo>[.git]`); an absolute/relative local directory is also accepted (no network). The API base is `https://api.github.com` for `github.com`, `https://<host>/api/v3` for any other host (GitHub Enterprise Server), or `CONFIG_GITHUB_API_URL` when set. Fetching uses Node's built-in `fetch` (Node ≥ 22 is already required): `GET /repos/{owner}/{repo}/tarball/{commit}` (follows the redirect to `codeload.github.com`), the gzip stream is unpacked **in memory** with the `tar` package, keeping only `config.yml` and `agents/*.yml` under the sub-path (the tarball's top-level `<owner>-<repo>-<sha>/` directory is stripped). No temporary files, no working copy and no `git` binary, so the container image and the deployment target need nothing but outbound HTTPS. A response-size cap (e.g. 20 MB) and entry filtering guard against oversized or hostile archives (no path traversal: entries are matched by name, never written to disk).

*Alternatives:* `git` CLI shallow fetch (rejected on request: requires the binary in every image/host and temp-dir handling; it would work with non-GitHub hosts, which are now out of scope); GitHub Contents API per file (not chosen: one request per file plus a directory listing, 1 MB limits per file in the JSON form, more rate-limit use than one tarball); a persistent clone (rejected: state to maintain); isomorphic-git (rejected: large dependency).

### 2. Resolve `CONFIG_REF` to a commit with one API call before downloading

`GET /repos/{owner}/{repo}/commits/{ref}` with `Accept: application/vnd.github.sha` returns the full 40-hex commit ID for a branch, a tag (annotated tags are dereferenced to their commit) or a commit ID (full or abbreviated, so abbreviated hashes are supported — unlike `git ls-remote`). Ambiguity between a branch and a tag of the same name is resolved by GitHub; the resolved full commit ID is what is stored and logged, so the outcome is always visible. Resolution before download lets a snapshot cache hit skip the tarball entirely; the repeat cost on every start is a single small request. An optional `If-None-Match` is not needed.

Error mapping (drives the fallback policy in decision 9): network error, timeout, HTTP 5xx, 429 and rate-limit 403 → **repository unavailable**; 401 and non-rate-limit 403 → **access denied** (also "unavailable" for the fallback policy, reported with the hint to check the token); 404 and 422 → **repository or ref not found** (GitHub returns 404 for a private repo the token cannot see, so the message says "not found or no access"), which is a configuration error and does not fall back.

### 3. Authentication via a bearer header, never via the URL

For a private repo, `CONFIG_GITHUB_TOKEN` (a fine-grained PAT with read-only *Contents* access, or a classic `repo` token) is sent as `Authorization: Bearer <token>` together with `X-GitHub-Api-Version: 2022-11-28` and `Accept` headers. The tarball request is made with `redirect: 'manual'`: the `Authorization` header goes to the API host only, and the redirect target (`codeload.github.com`, a pre-signed URL) is fetched **without** it (and only if its host is `codeload.<host>`/`*.githubusercontent.com`-like for the configured GitHub host; any other redirect target is refused). Every error text passes through a redactor that removes the token before it is logged or thrown. A URL that embeds credentials is rejected at startup; a token is only ever read from the environment.

*Alternatives:* token in the URL (rejected: leaks into logs and error messages); GitHub App installation tokens (not rejected as a future option; needs key handling and token minting, not needed now); SSH deploy key (not applicable to the REST API).

### 4. Spring-style placeholders resolved after YAML parsing

Agent files use `${env.NAME}` and `${env.NAME:default}` (Spring placeholder syntax; `NAME` is a key of the `env` block of `config.yml`). Unlike `{{...}}`, which opens a flow mapping and makes `model: {{env.AGENT_MODEL}}` invalid YAML, `model: ${env.AGENT_MODEL}` is a valid plain scalar in block context, so every agent file is **valid YAML as written** and is parsed first. Placeholders are then resolved on the parsed tree, in string scalars only (keys are not touched):

- a scalar that is exactly one placeholder takes the **typed** value from `env` (`maxTokens: ${env.AGENT_MAX_TOKENS}` → number 4096);
- a placeholder inside a longer string is interpolated as text (`"Model ${env.AGENT_MODEL}"`);
- `$${` is an escape for a literal `${` (system prompts that must contain one);
- an undefined name without default is a validation error naming file and variable (`agents/selector.yml: undefined variable env.FOO`) — never a silent empty string; `config.yml` is not resolved (it defines the variables), and `env` values are not expanded recursively.

Because substitution happens after parsing, a value containing `:`, `#` or quotes cannot break the YAML structure — no quoting rules for authors. The only remaining constraint is YAML's: inside flow collections (`[...]`, `{...}`) a bare `${...}` must be quoted. Duplicate YAML keys are rejected by the parser (the first draft's duplicate `outputConfig` key is an error; the sample uses one `outputConfig` per file: selector `effort: 'low'`, others `effort: ${env.AGENT_THINKING_EFFORT}`).

Variables come **only** from `config.yml`, not from `process.env`, so a commit renders the same way on every host (`hash` fully identifies behaviour). The process environment is used only for the model connection fallback (`MODEL_BASE_URL`/`MODEL_API_KEY`).

*Alternatives:* `{{env.X}}` text substitution before parsing (rejected: not valid YAML unquoted, verbatim insertion can break structure for string values); a full templating engine such as Handlebars/Mustache (rejected: logic and escaping surface that a prompt file does not need); allowing `process.env` as a variable source (rejected: the same commit would behave differently per host and the snapshot would not be reproducible).

### 5. Validation with zod; the config is all-or-nothing

Parsed files are validated with zod against the same shape as today's `AgentDefinition` (`model`, `maxTokens` > 0 integer, `thinking.type = 'adaptive'`, `outputConfig.effort` ∈ low/medium/high, `tools[]` = `{type:'local', name}` or `{type:'mcp', server}`, non-empty `systemPrompt`; unknown keys rejected). Cross-checks: `agents/selector.yml` and `agents/other.yml` must exist; every `local` tool name must exist in the code's local tool registry; every `mcp` server must be a key of `mcpServers`; agent file name = agent name (`[a-z][a-z0-9_]*`). The set of downstream agents (the `selectAgent` enum) is every loaded agent except `selector`, so adding a file adds a routable agent. Any violation fails the whole load with all messages listed; a half-valid config is never used or cached.

### 6. `config.yml`: `env`, `mcpServers`, `settings`, optional `model`

```yaml
env:                      # variables for ${env.NAME} in agents/*.yml
  AGENT_MODEL: claude-sonnet-5-5
  AGENT_MAX_TOKENS: 4096
  AGENT_THINKING_EFFORT: medium
mcpServers:               # server name -> literal URL
  user: 'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/user'
  asset: 'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/asset'
  location: 'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/location'
  work_order: 'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/work-order'
settings:                 # all optional, defaults = today's constants
  maxContextMessages: 20
  recursionLimit: 10
  selector: { maxTurns: 5, minConfidence: 0.5 }
model:                    # optional; overrides MODEL_BASE_URL / MODEL_API_KEY when present
  baseUrl: https://...
  apiKey: ...
```

Additional variables considered and added: the four global constants (`settings`) and the model connection (`model`, optional because the repo is private and secrets are acceptable there). `mcpServers` values are **literal URLs** (simple; the URL is versioned with the rest of the config, so one commit means one set of endpoints; a different environment uses a different ref or config path). An empty string skips that server (same tolerance as an unset variable today); the URLs may be written as `${env.NAME}` placeholders if a shared URL is wanted. Not added now (YAGNI): per-agent temperature/timeouts, MCP headers, tool allow-lists beyond `tools`.

### 7. Snapshots: one row per agent per commit, resolved content, written transactionally

`agent_config_snapshots` today has PK `hash` (content SHA-256) which cannot hold four agents under one commit ID. The table becomes one row per `(hash, agentName)`: `hash` = commit ID, `agentName`, `version` = `CONFIG_REF` of the latest resolution, `source` (repo URL + sub-path, no credentials), `definition` (rendered agent definition, jsonb), `settings` (jsonb: rendered `settings`, `mcpServers` and `model` block, identical on every row of a commit), `contentHash` (SHA-256 of the canonical definition, kept so the old identity remains computable and legacy rows are not orphaned), `firstSeenAt`, `resolvedAt`. All rows of a commit are written in one transaction, so "rows exist for this commit" means "complete". Migration: drop the PK on `hash`, add PK `(hash, agentName)`, widen `version` to 255, add the new columns (nullable/defaulted for legacy rows).

**Invalidation**: at startup, after step 2, look up rows by `(hash, source)`. *Hit* = rows exist and their `version` equals `CONFIG_REF` → load them, no fetch. *Same hash, different ref* (e.g. switching `main` to the commit ID it points at) → no re-parse needed, rows are reused and `version`/`resolvedAt` are updated. *Different hash* (branch moved, tag re-pointed, new commit) → miss: fetch, render, validate, insert. This realises "if `hash` or `version` changes the cache is invalidated" without ever serving a definition for the wrong commit. Because the cache key is a commit ID (content-addressed), the snapshot of an immutable ref can never go stale; only the ref → commit mapping is re-checked, on each start.

*Alternatives:* store one JSON blob per commit (rejected: the chat-log joins `(agentName, agentConfigHash)` and per-agent queries fit rows better, and the `add-chat-logging-review` schema already has this shape); content hash as the key (rejected: the user wants the commit as identity and Git as source of truth); Redis cache (rejected: the DB table already exists, is durable and doubles as the offline fallback).

### 8. Runtime access through an injected, immutable `AgentConfigService`

A Nest async provider loads the config during bootstrap (the app does not listen until it resolves) and exposes an immutable `LoadedAgentConfig { hash, version, source, agents: Record<string, AgentDefinition>, settings, mcpServers, model }` plus helpers (`resolveAgent(name)` falling back to `selector`, `downstreamAgents()`, `identity(name)`). `AgentService`, the middleware, `selectAgent` and `ChatLogService` receive it by injection instead of importing constants; `agent.config.ts` keeps only the types. `agentConfigIdentity(name)` returns `{ version: CONFIG_REF, hash: commit ID, definition }`, so chat logs written afterwards carry the commit. `AgentName` stops being a compile-time union (it is data now) and becomes `string`; stored session agent names that are no longer defined still fall back to `selector` (existing behaviour).

*Alternatives:* module-level mutable singleton (rejected: hidden global, awkward in tests); reading the snapshot table per request (rejected: a query per chat call for data that cannot change within a process).

### 9. Startup failure and fallback policy

- Missing `CONFIG_SOURCE` or (for a GitHub source) `CONFIG_REF` → startup error naming the variable; a non-GitHub or malformed URL → startup error.
- Ref resolved and config invalid → startup error with the validation messages (a broken commit must be noticed, not masked by an older snapshot).
- Repository unavailable or access denied (network, timeout, 5xx, rate limit, 401/403 — see decision 2) → if a snapshot exists for the same `(source, version)`, use the newest by `resolvedAt` and log a warning with the stale commit ID; otherwise startup error. A repository or ref that GitHub reports as not found (404/422) is an error even when a cache exists, since that is a configuration mistake rather than an outage.
- Local directory source: no cache, `hash` = SHA-256 over the sorted file contents, `version` = `CONFIG_REF` or `local`; intended for development and tests.

### 10. Tests and the sample

`docs/config-sample/` is the source of truth for the YAML equivalent of today's code. A one-off parity test (kept until `AGENTS` is deleted) loads it through the local-directory source and deep-equals it to the hard-coded `AGENTS` and constants; afterwards unit tests (middleware, agent service, tools, chat log) use the sample as their fixture, so the sample cannot rot. GitHub access is tested against a fake GitHub API server started in the test (a local HTTP server selected through `CONFIG_GITHUB_API_URL` that serves the commit lookup and a generated tarball), covering branch, tag, commit ID, moving branch, 401/403/404/5xx/rate-limit, redirect handling and token redaction; no network in tests.

## Risks / Trade-offs

- [Startup depends on GitHub availability] → fallback to the last snapshot of the same ref when unavailable; ref resolution is a single small request; documented.
- [A mutable branch changes behaviour at the next restart, possibly unnoticed] → the commit ID is logged at startup and stored on every chat-log message; production should pin a tag or commit.
- [Bad commit blocks startup (and rolling deployments)] → deliberate fail-fast; rollback = change `CONFIG_REF`; a CI validation of the config repo can reuse the same loader later.
- [GitHub API rate limits (60/h unauthenticated, 5000/h with a token) and the dependence on `api.github.com`/`codeload.github.com` reachability] → one resolve call per start and a tarball only on a cache miss; the token is recommended even for public repos; fallback to the snapshot on rate-limit.
- [Only GitHub (and GitHub Enterprise Server) is supported] → accepted; the source module is the only place that knows GitHub, so another host could be added behind the same `resolveRef`/`fetchFiles` interface.
- [Tarball handling] → in-memory only, size cap, entries matched by name, no extraction to disk.
- [Secrets in the snapshot table and possibly in logs] → private repo accepted by the owner; snapshots live in the app DB (same trust zone); logs print only commit ID, ref, source (no credentials) and never rendered definitions or `config.yml` contents; token redaction on all git output.
- [A bare `${env.X}` inside a YAML flow collection (`[...]`/`{...}`) is invalid YAML] → validation fails fast with file and position; authors quote it; documented in the sample README.
- [MCP URLs are the same on every host that uses the same ref] → by choice (simplicity); per-environment URLs mean a separate ref/branch or sub-path of the config repo.
- [`AgentName` loses its compile-time union] → runtime checks (`resolveAgent`, zod, the `selectAgent` enum built from loaded agents) replace the type; covered by tests.
- [Chat-log schema coupling with the unarchived `add-chat-logging-review`] → this change assumes that change's `agent_config_snapshots` table exists (it is already in the code base and migration `1700000000003`); our migration is `1700000000004`.

## Migration Plan

1. Create the config repository content from `docs/config-sample/` (commit, tag e.g. `v1.0`), create a read-only token.
2. Set `CONFIG_SOURCE`, `CONFIG_REF=v1.0`, `CONFIG_GITHUB_TOKEN` (`MODEL_*` stay as today; `MCP_*_URL` are no longer read by the API) in every environment; no `git` binary or image change is needed, only outbound HTTPS to GitHub.
3. Deploy the API with `DB_MIGRATIONS_RUN=true` (or run `migration:run`); first start fetches `v1.0` and fills `agent_config_snapshots`; later starts hit the cache.
4. Rollback: redeploy the previous API image and previous env (the old code ignores the new variables; old snapshot rows keep their legacy shape-compatible columns; the migration `down` restores the old primary key only if no commit-keyed duplicates exist — otherwise those rows are deleted first).

## Open Questions

- Should `${env.X}` fall back to `process.env.X` when not defined in `config.yml` (more convenient for per-environment overrides, but not reproducible)? Current decision: no.
- Is a periodic re-check of a mutable branch (restart-free refresh) wanted later? Out of scope here; the snapshot/identity design does not prevent it.
