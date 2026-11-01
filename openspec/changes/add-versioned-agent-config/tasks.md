## 1. Sample config (initial config for the Config Repo)

- [x] 1.1 Create `docs/config-sample/langchain-example/config.yml` with `env` (`AGENT_MODEL`, `AGENT_MAX_TOKENS`, `AGENT_THINKING_EFFORT`), `mcpServers` (`user`/`asset`/`location`/`work_order` → literal `https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/{user,asset,location,work-order}` URLs) and `settings` (`maxContextMessages: 20`, `recursionLimit: 10`, `selector.maxTurns: 5`, `selector.minConfidence: 0.5`), values equal to today's constants
- [x] 1.2 Write the four hard-coded agents of `agent.config.ts` as `docs/config-sample/langchain-example/agents/{selector,fault_report,work_order_inquiry,other}.yml` (model/`maxTokens`/`outputConfig.effort` via `${env.*}` (unquoted), selector effort `'low'`, one `outputConfig` key per file, prompts reproduced exactly — `COMMON_RULES` expanded into each prompt, tools as `{type: local|mcp, ...}`)
- [x] 1.3 Write `docs/config-sample/README.md`: layout, `CONFIG_SOURCE` / `CONFIG_REF` / `CONFIG_GITHUB_TOKEN` examples, how to copy the sample into the private config repository, tag it `v1` and create a read-only token, the `${env.NAME[:default]}` placeholder syntax (typed whole-value substitution, `$${` escape, quote it inside `[...]`/`{...}`)
- [x] 1.4 Parity test (temporary, removed in 7.3): load the sample through the local-directory source and deep-equal each agent and the global settings to the hard-coded `AGENTS` and constants (run once against the previous `agent.config.ts` from git before it was reduced to types; passed, test file removed)

## 2. Dependencies, environment and image

- [x] 2.1 Add `yaml`, `tar` (and `zod` if not already a direct dependency of `apps/api`) to `apps/api/package.json`
- [x] 2.2 `config/env.ts`: add `agentConfig: { source, ref, githubToken, githubApiUrl }` from `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN`, `CONFIG_GITHUB_API_URL`; drop `MCP_SERVER_ENV`/`mcp.servers` from `loadEnv` (MCP URLs are resolved from the config); update the env unit test
- [x] 2.3 `.env.example`: document `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN`, `CONFIG_GITHUB_API_URL` (GitHub Enterprise only); keep `MODEL_*`; remove `MCP_*_URL` (no longer read by the API; check docker compose/mcp-server usage first)
- [ ] 2.4 Docker compose / deployment env passthrough for the new variables (no image change: no `git` binary is needed); check that the API container can reach `api.github.com` and `codeload.github.com` — compose already passes the whole `.env` (`env_file`), so nothing to change; reachability from the deployment target is still to be checked

## 3. Config loading (pure, offline-testable)

- [x] 3.1 `agent-config/config.schema.ts`: zod schemas for `config.yml` (`env`, `mcpServers`, `settings` with defaults, `model`) and an agent definition (strict, no unknown keys); `LoadedAgentConfig` type
- [x] 3.2 `agent-config/render.ts`: parse agent YAML (duplicate keys rejected), then resolve `${env.NAME[:default]}` placeholders in string values (typed for whole-value, interpolated otherwise, `$${` escape, undefined-without-default errors with file + variable)
- [x] 3.3 `agent-config/validate.ts`: assemble `LoadedAgentConfig` from files, cross-checks (required `selector`/`other`, local tool names exist in the tool registry, MCP servers declared, file name = agent name), collect all errors into one thrown error; skip `mcpServers` entries with an empty URL with a warning
- [x] 3.4 Unit tests: placeholder resolution (number stays number, interpolation, default, `$${` escape, value with `:`/`#`), undefined variable, duplicate key, each validation rule, several errors reported together, defaults for omitted `settings`, empty MCP URL skipped, `MCP_*_URL` env ignored

## 4. Source access (GitHub API and local directory)

- [x] 4.1 `agent-config/source.ts`: parse `CONFIG_SOURCE` (`https://<host>/<owner>/<repo>[.git]//subpath`, local path), derive the API base URL (`api.github.com`, `<host>/api/v3`, or `CONFIG_GITHUB_API_URL`), reject embedded credentials / non-HTTPS / non-repository URLs, redact the token from any output
- [x] 4.2 `agent-config/github.ts`: `resolveRef` via `GET /repos/{o}/{r}/commits/{ref}` with `Accept: application/vnd.github.sha` and `fetchFiles` via `GET /repos/{o}/{r}/tarball/{commit}` (Node `fetch`, `redirect: 'manual'`, token only on the API host, redirect host allow-check, request timeout, size cap), unpacking in memory with `tar` and keeping only `config.yml` and `agents/*.yml` under the sub-path (strip the `<owner>-<repo>-<sha>/` prefix); map errors to `unavailable` (network/timeout/5xx/429/rate-limit 403), `access denied` (401/403) and `not found` (404/422)
- [x] 4.3 Local directory source: read files; `hash` = SHA-256 over sorted file names + contents, `version` = `CONFIG_REF` or `local`
- [x] 4.4 Tests against a fake GitHub API server started in the test (`CONFIG_GITHUB_API_URL`; serves the commit lookup and a generated tarball, plus a second host for the redirect): branch, annotated tag, full and abbreviated commit ID, sub-path, branch moves between loads, 401/403/404/5xx/rate-limit mapping, redirect without `Authorization`, refused foreign redirect, oversized archive, token never present in thrown errors/logs (use a fake token)

## 5. Snapshot cache and database

- [x] 5.1 Migration `1700000000004-agent-config-versioning`: drop PK on `agent_config_snapshots.hash`, add PK `(hash, agentName)`, widen `version` to 255, add `source`, `settings` (jsonb, default `{}`), `contentHash` (nullable), `resolvedAt`; working `down`; run it against a local database and check legacy rows survive (ran up, down, up against the DB in `.env`, which is the remote `developbranch.cn` dev database, not a local one; schema checked, the 2 legacy rows survived)
- [x] 5.2 Update `AgentConfigSnapshot` entity (composite PK, new columns) and register as before in `data-source-options.ts`
- [ ] 5.3 `agent-config/snapshot.store.ts`: `find(hash, source)`, `saveAll(rows)` in one transaction (upsert on `(hash, agentName)`), `touchVersion(hash, source, version)`, `latest(source, version)`; unit/integration tests incl. partial-write rollback — implemented; unit-tested through an in-memory store in the loader tests (atomic write, update-on-conflict semantics); `TypeOrmSnapshotStore` itself has no test against a real Postgres yet
- [x] 5.4 `agent-config/agent-config.loader.ts`: orchestrate resolve → cache lookup (hit / same hash other ref / miss) → fetch+validate+store, with the failure policy (invalid config fails without fallback; unreachable → newest snapshot of same source+version with warning; missing ref fails); log commit ID, version, source only
- [x] 5.5 Tests for the loader with a fake source and an in-memory store: first start, restart hit (no fetch), moved branch, same commit different ref, unreachable with/without cache, invalid commit with older snapshot present

## 6. Wire the config into the application

- [x] 6.1 `AgentConfigModule`/`AgentConfigService` as an async provider loaded during bootstrap (app does not listen until it resolves); expose `agents`, `settings`, `mcpServers`, `model`, `resolveAgent(name)` (unknown → `selector`), `downstreamAgents()`, `identity(name)`
- [x] 6.2 Refactor consumers to inject it instead of importing constants: `AgentService` (models per agent, max context, recursion limit, model connection precedence config > env, MCP servers from config), `multi-agent.middleware`, `select-agent.tool` (enum from downstream agents, turn/confidence limits from settings), `agent.log.ts`/`agent.context.ts` types, `chat-log.service.ts`
- [x] 6.3 `agent.config-identity.ts`: return `{ version: CONFIG_REF, hash: commit ID, definition }` from the loaded config; adapt `ChatLogService.ensureConfig` to write/read the snapshot row of `(hash, agentName)` without inserting a duplicate row; adapt its unit tests
- [x] 6.4 `AgentName` becomes `string` (runtime-checked); reduce `agent.config.ts` to types only (`AgentDefinition`, `AgentToolRef`, `LoadedAgentConfig` re-export) once nothing imports the constants
- [x] 6.5 Move the existing unit tests (`agent.service.spec`, `multi-agent.middleware.spec`, `tools.spec`, `chat-log*.spec`, `mcp.client.spec`) to the loaded sample config as fixture; add scenarios from the specs (configured selector limits, added agent becomes routable)

## 7. Verification and cleanup

- [ ] 7.1 Run `pnpm lint`, `pnpm checkstyle`, `pnpm test`; start the API with `CONFIG_SOURCE=docs/config-sample/langchain-example` (local source) and send a chat message through the selector to a downstream agent; confirm `agent_config_snapshots`/chat logs fill as specified — lint, 125 unit tests and the build pass; the API starts with the local sample source and `/api/health` is up; a chat message through the selector to a downstream agent was not run (needs `MODEL_*` and MCP access)
- [ ] 7.2 Manual end-to-end against the real private GitHub repo with a token: tag `v1`, then a branch (move it and restart), unreachable network fallback (block `api.github.com`), and wrong-token error without token leakage — not run: needs the real private repository and token
- [x] 7.3 Remove the parity test (1.4) and the hard-coded `AGENTS`/constants; update `README.md` (config repo setup, new env variables, startup behaviour)
