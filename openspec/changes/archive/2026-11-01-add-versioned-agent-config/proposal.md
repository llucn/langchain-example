## Why

The four agents (`selector`, `fault_report`, `work_order_inquiry`, `other`), their prompts and the agent parameters are hard-coded in `apps/api/src/agent/agent.config.ts`. Tuning a prompt means a code change, a build and a deployment, and there is no way to say "this conversation ran with config v3" other than a content hash. The planned improvement loop (see `add-chat-logging-review`) needs the Agent Config to be a versioned artefact that can be edited, reviewed, tagged, rolled back and attributed to every logged message. A Git repository gives all of that for free.

## What Changes

- **External Agent Config in a GitHub repository.** The API reads its agent definitions and agent parameters from a (private) GitHub repository instead of `agent.config.ts`:
  - `CONFIG_SOURCE` = repository URL plus sub-path, e.g. `https://github.com/llucn/config.git//langchain-example` (`//` separates the repo from the directory inside it); a local directory path is also accepted for development and tests.
  - `CONFIG_REF` = branch, tag or commit ID (a branch is a mutable config, a tag or commit an immutable one). The repository is read through the **GitHub REST API** (commit lookup + tarball download over HTTPS); no `git` binary is needed.
  - `CONFIG_GITHUB_TOKEN` = access token for the private repository (sent as a bearer header, never put into a URL or a log); optional `CONFIG_GITHUB_API_URL` for GitHub Enterprise Server (default derived from the repository host).
- **Config layout**: `<sub-path>/config.yml` (variables, MCP servers and global agent parameters) and `<sub-path>/agents/<name>.yml` (one file per agent). Agent files may reference variables as Spring-style placeholders `${env.NAME}` (optionally `${env.NAME:default}`); values come from the `env:` block of `config.yml`. Because the repository is private, config files may contain sensitive values.
- **Startup resolution and snapshot cache.** On startup the API resolves `CONFIG_REF` to a commit ID, and checks `agent_config_snapshots`: when a snapshot with the same `hash` (commit ID) and `version` (`CONFIG_REF`) exists it is used as is, otherwise the repository is fetched, rendered, validated and stored as new snapshot rows. The API fails fast on startup when no valid config can be obtained; if the repository is unreachable it falls back to the newest snapshot of the same `CONFIG_REF`.
- **Extended `config.yml`**: besides `env` and `mcpServers`, a `settings` block carries what is hard-coded today as global constants (max context messages, recursion limit, selector turn limit and confidence threshold), and an optional `model` block for the endpoint/key (falling back to `MODEL_BASE_URL`/`MODEL_API_KEY`). `mcpServers` maps each server name directly to its URL (literal values, no environment variable indirection).
- **Chat log attribution**: the `agentConfigVersion` / `agentConfigHash` written to chat logs become `CONFIG_REF` / commit ID (hash and version of the snapshot in use). `agent_config_snapshots` changes from "one row per content hash" to "one row per agent per commit".
- **Initial config files**: the current hard-coded definitions are written as YAML into `docs/config-sample/` (a ready-to-copy `langchain-example/` tree for the config repository). Initialising the config repository from it is a manual prerequisite before the new API can start; this is tracked in `tasks.md`.
- **BREAKING**: the API no longer starts without `CONFIG_SOURCE` and `CONFIG_REF`; `AGENTS` and the global constants are removed from `agent.config.ts` (only types remain); the `MCP_*_URL` variables are no longer read by the API; MCP URLs are literal values in `config.yml`'s `mcpServers`.
- **Not in scope**: hot reload / polling of a mutable branch while running (a restart picks up changes), a config editor UI, per-session config pinning, signature verification of commits, a webhook-driven refresh.

## Capabilities

### New Capabilities
- `agent-config`: where the Agent Config comes from (`CONFIG_SOURCE`/`CONFIG_REF`/token), the repository layout, `${env.*}` placeholder resolution, validation, resolution of `CONFIG_REF` to a commit, the `agent_config_snapshots` cache and its invalidation, startup failure and fallback behaviour, and the sample config in `docs/config-sample`.

### Modified Capabilities
- `multi-agent`: "Agent definitions in code" becomes "Agent definitions from the Agent Config" (same four agents and same definition fields, now loaded from the snapshot); the selector turn limit and confidence threshold come from config settings.
- `mcp-tools`: "Configurable remote MCP servers" — the servers and their URLs are declared in the Agent Config (`mcpServers`, literal URLs) instead of four fixed env variables read by the code.
- `ai-agent`: "Environment-driven model connection" and "Bounded conversation context" — model name, token limit, thinking and maximum context now come from the Agent Config; endpoint and key stay in the environment unless the config's `model` block overrides them.

## Impact

- Code (api): new `agent-config` module (GitHub REST/tarball client, YAML parse, template render, validation with zod, snapshot store, in-memory `AgentConfigService`); `AgentService`, `multi-agent.middleware`, `select-agent.tool`, `chat-log.service` and `agent.config-identity.ts` read definitions from `AgentConfigService` instead of the `AGENTS` constant; `config/env.ts` gains `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN`, `CONFIG_GITHUB_API_URL` and drops the fixed MCP variables; existing unit tests are moved onto a fixture config.
- Database: one migration altering `agent_config_snapshots` (primary key `(hash, agentName)`, new columns for `ref`, resolved `settings`/`source` and `contentHash`); chat log tables unchanged (they already store name + version + hash).
- Dependencies: `yaml` (parser) and `tar` (reads the GitHub tarball in memory); no `git` binary or other change to the container image; outbound HTTPS to `api.github.com` and `codeload.github.com` is required from the API.
- Environment / docs: `.env.example` documents the new variables; `docs/config-sample/` added (agents, `config.yml`, README with the init steps).
- Operations: the config repository becomes a deployment prerequisite; a bad commit on a mutable branch is only detected at the next start (startup fails, previous snapshot is not silently used when the ref resolves but is invalid).
- Security: the token is sent as an `Authorization` header (not forwarded across the tarball redirect), never in a URL, and is redacted from logs and error messages; snapshots may contain secrets from the config and are stored in the application database.
