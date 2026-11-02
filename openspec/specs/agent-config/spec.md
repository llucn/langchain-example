# agent-config Specification

## Purpose
TBD - created by archiving change add-versioned-agent-config. Update Purpose after archive.
## Requirements

### Requirement: Agent Config source
The system SHALL load its Agent Config from the location in `CONFIG_SOURCE`, which is either the HTTPS URL of a GitHub repository optionally followed by `//` and a sub-path inside the repository (e.g. `https://github.com/llucn/config.git//langchain-example`), or a path to a local directory. The system SHALL read a GitHub repository through the GitHub REST API (commit lookup and tarball download) and SHALL NOT require the `git` command. For a GitHub source the system SHALL also require `CONFIG_REF`, a branch name, tag name or commit ID. The GitHub API base is derived from the repository host (`https://api.github.com` for `github.com`, `https://<host>/api/v3` otherwise) unless `CONFIG_GITHUB_API_URL` is set. The system SHALL read `config.yml` and the files `agents/<name>.yml` from the sub-path (or the repository root when none is given). The system SHALL reject a source URL that contains embedded credentials, a non-HTTPS URL and a URL that is not a repository URL.

#### Scenario: Repository with sub-path
- **WHEN** `CONFIG_SOURCE=https://github.com/llucn/config.git//langchain-example` and `CONFIG_REF=v1.0`
- **THEN** the system reads `langchain-example/config.yml` and `langchain-example/agents/*.yml` from the commit that tag `v1.0` points to

#### Scenario: Missing settings
- **WHEN** `CONFIG_SOURCE` is unset, or is a GitHub URL and `CONFIG_REF` is unset
- **THEN** startup fails with an error naming the missing variable

#### Scenario: Local directory
- **WHEN** `CONFIG_SOURCE` is a path to a directory containing `config.yml` and `agents/`
- **THEN** the config is read from that directory without network access

### Requirement: Reference resolution
The system SHALL resolve `CONFIG_REF` to a full 40-character commit ID through the GitHub API before reading any file: a branch name resolves to the head commit of the branch, a tag name to the commit the tag points to (annotated tags are dereferenced), and a full or abbreviated commit ID to that commit. A reference GitHub cannot resolve SHALL fail startup with an error that names the reference and the source.

#### Scenario: Branch
- **WHEN** `CONFIG_REF=main` and branch `main` points to commit `abc…`
- **THEN** the config is read from commit `abc…` and `main` is recorded as the version

#### Scenario: Annotated tag
- **WHEN** `CONFIG_REF=v1.0` names an annotated tag
- **THEN** the commit the tag points to is used

#### Scenario: Abbreviated commit ID
- **WHEN** `CONFIG_REF` is the first 7 characters of a commit ID
- **THEN** the full commit ID is resolved and used as `hash`

#### Scenario: Unknown reference
- **WHEN** GitHub reports that `CONFIG_REF` or the repository does not exist (or is not visible to the token)
- **THEN** startup fails with an error that names the reference and the source and says it was not found or not accessible

### Requirement: Private repository access
The system SHALL authenticate to the GitHub API with `CONFIG_GITHUB_TOKEN` when it is set, as a bearer `Authorization` header, and never in a URL. The same token SHALL be used both to read the config and, when an admin publishes an improvement proposal, to create a branch, a commit and a pull request in the config repository; reading needs *Contents* read access and publishing additionally *Contents* and *Pull requests* write access. The system SHALL NOT forward the token to the host the tarball download redirects to, and SHALL refuse a redirect to a host other than a GitHub download host. The token SHALL NOT appear in logs, error messages, snapshots or stored proposals. Writes SHALL never target the repository's default branch directly and SHALL never merge a pull request. Publishing SHALL be unavailable when `CONFIG_SOURCE` is a local directory.

#### Scenario: Token supplied
- **WHEN** `CONFIG_GITHUB_TOKEN` is set and the repository is private
- **THEN** the config is read successfully and no log line or error contains the token

#### Scenario: Token not forwarded
- **WHEN** the tarball request is redirected to the download host
- **THEN** the request to the download host carries no `Authorization` header

#### Scenario: Authentication fails
- **WHEN** the token is invalid or lacks access (HTTP 401/403)
- **THEN** the failure is reported as an access error for the source with a hint to check the token, with the token redacted

#### Scenario: Unexpected redirect target
- **WHEN** the tarball request is redirected to an unrelated host
- **THEN** the download is refused and startup fails or falls back as for an unavailable repository

#### Scenario: Token without write permission
- **WHEN** an admin publishes a proposal and the token lacks write access (HTTP 403 or 404 on a write request)
- **THEN** publishing fails with an error saying the token needs Contents and Pull requests write access, the proposal stays `ready` and the error contains no token value

#### Scenario: Branch only
- **WHEN** a proposal is published
- **THEN** commits are made on a new `improvement/` branch and the pull request is left open

#### Scenario: Local config source
- **WHEN** `CONFIG_SOURCE` is a local directory
- **THEN** publishing is unavailable and no GitHub write request is made

### Requirement: Config layout and variables
`config.yml` SHALL be a YAML mapping with optional blocks `env` (variable name → scalar value), `mcpServers`, `settings` and `model`. Each file `agents/<name>.yml` SHALL define one agent whose name is the file name without extension. After parsing an agent file the system SHALL resolve each placeholder `${env.NAME}` or `${env.NAME:default}` in its string values with the value of `NAME` in the `env` block of `config.yml`, falling back to `default` when `NAME` is undefined. A string value that consists of exactly one placeholder SHALL take the typed value (e.g. a number); a placeholder inside a longer string SHALL be interpolated as text; `$${` SHALL stand for a literal `${`. A placeholder for an undefined variable without default SHALL be a validation error. Duplicate YAML keys SHALL be a validation error.

#### Scenario: Variable substitution
- **WHEN** `env.AGENT_MAX_TOKENS` is `4096` and an agent file contains `maxTokens: ${env.AGENT_MAX_TOKENS}` (unquoted)
- **THEN** the file parses and the agent's `maxTokens` is the number 4096

#### Scenario: Interpolation and default
- **WHEN** a prompt contains `Model: ${env.AGENT_MODEL}, region ${env.REGION:eu}` and `REGION` is undefined
- **THEN** the prompt reads `Model: claude-sonnet-5-5, region eu`

#### Scenario: Escaped placeholder
- **WHEN** a prompt contains `$${env.X}`
- **THEN** the resulting prompt contains the literal text `${env.X}`

#### Scenario: Value with YAML special characters
- **WHEN** an `env` value contains `: ` or `#` and is used as `model: ${env.V}`
- **THEN** the agent's `model` is exactly that string and the YAML structure is unaffected

#### Scenario: Undefined variable
- **WHEN** an agent file references `${env.NOT_DEFINED}` with no default
- **THEN** loading fails with a message that names the file and the variable

#### Scenario: Process environment is not a variable source
- **WHEN** a variable is referenced that exists only in the process environment
- **THEN** loading fails as for an undefined variable

### Requirement: Config validation
The system SHALL validate the loaded config as a whole and use it only if it is valid. An agent definition SHALL have `model` (non-empty string), `maxTokens` (positive integer), `thinking.type` `adaptive`, `outputConfig.effort` one of `low`, `medium`, `high`, `tools` (each `{type: local, name}` or `{type: mcp, server}`) and a non-empty `systemPrompt`, and SHALL NOT have unknown keys. The agents `selector` and `other` SHALL exist. Every local tool name SHALL be a tool the application provides and every MCP `server` SHALL be a key of `mcpServers`. All violations SHALL be reported together, and a config with any violation SHALL NOT be used or stored.

#### Scenario: Valid sample
- **WHEN** the files of `docs/config-sample` are loaded
- **THEN** four agents `selector`, `fault_report`, `work_order_inquiry` and `other` are produced

#### Scenario: Unknown tool
- **WHEN** an agent lists a local tool `fooBar` that the application does not provide
- **THEN** loading fails and the message names the agent and the tool

#### Scenario: Unknown MCP server
- **WHEN** an agent lists the MCP server `billing` that is not in `mcpServers`
- **THEN** loading fails and the message names the agent and the server

#### Scenario: Missing required agent
- **WHEN** `agents/selector.yml` does not exist
- **THEN** loading fails with a message that `selector` is required

#### Scenario: Several errors
- **WHEN** two agent files are invalid
- **THEN** the error lists the problems of both files

### Requirement: Global settings, MCP servers and model block
`settings` SHALL be optional with `maxContextMessages` (default 20), `recursionLimit` (default 10), `selector.maxTurns` (default 5), `selector.minConfidence` (default 0.5), `memory.enabled` (default true) and `memory.maxMemories` (positive integer, default 30). `mcpServers` SHALL map each server name to its URL as a literal string; an empty URL SHALL skip that server with a warning. The optional `model` block (`baseUrl`, `apiKey`) SHALL take precedence over `MODEL_BASE_URL` and `MODEL_API_KEY` when present.

#### Scenario: Defaults
- **WHEN** `config.yml` has no `settings` block
- **THEN** the effective settings are 20 context messages, recursion limit 10, selector max turns 5, minimum confidence 0.5, memory enabled and 30 memories

#### Scenario: Memory settings
- **WHEN** `config.yml` sets `settings.memory.enabled: false` and `maxMemories: 10`
- **THEN** the effective settings are memory disabled and 10 memories, and a non-integer or non-positive `maxMemories` fails validation

#### Scenario: Literal MCP URL
- **WHEN** `mcpServers.user` is `'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/user'`
- **THEN** the `user` MCP server uses that URL regardless of the process environment

#### Scenario: Empty URL
- **WHEN** a server's URL is the empty string
- **THEN** that server is skipped, a warning names the server, and the other servers are used

### Requirement: Snapshot cache
The system SHALL cache the loaded config in `agent_config_snapshots`, one row per agent per commit, holding the commit ID (`hash`), `version` (`CONFIG_REF`), source (without credentials), the rendered agent definition, the resolved global settings and the time of resolution; all rows of a commit SHALL be written atomically. On startup, after resolving `CONFIG_REF` to a commit ID, the system SHALL use the stored snapshot without fetching or parsing the repository when rows for that commit and source exist. When the commit ID differs from every stored snapshot (the branch moved, the tag was re-pointed, a new ref) the cache SHALL be considered invalid and the system SHALL fetch, render, validate and store the config as new rows. When the commit ID is known but `CONFIG_REF` differs from the stored `version`, the stored rows SHALL be reused and their `version` updated.

#### Scenario: First start
- **WHEN** no snapshot exists for the resolved commit
- **THEN** the tarball is downloaded and four rows (one per agent) are stored with the commit ID as `hash` and `CONFIG_REF` as `version`

#### Scenario: Restart on the same commit
- **WHEN** the API restarts and `CONFIG_REF` still resolves to a commit with stored rows
- **THEN** the config is served from the rows and no tarball is downloaded

#### Scenario: Mutable branch moved
- **WHEN** `CONFIG_REF` is a branch that has new commits since the last start
- **THEN** the old snapshot is not used, the new commit is fetched and stored, and the old rows remain for chat-log attribution

#### Scenario: Same commit, other reference
- **WHEN** `CONFIG_REF` changes from `main` to the commit ID `main` points to
- **THEN** the stored rows are reused and their `version` becomes the commit ID

#### Scenario: Partial write
- **WHEN** storing the snapshot fails midway
- **THEN** no rows of that commit remain, and the next start fetches again

### Requirement: Startup behaviour and fallback
The system SHALL load the config before it accepts requests and SHALL fail startup when no valid config can be obtained. When the reference resolves but the config is invalid, startup SHALL fail without falling back to older snapshots. When the repository is unavailable (network error, timeout, HTTP 5xx, rate limit, or an authentication/access failure), the system SHALL use the newest stored snapshot with the same source and `version` and log a warning with its commit ID; with no such snapshot startup SHALL fail. A repository or reference that GitHub reports as not found SHALL fail startup even if snapshots exist. The system SHALL log the commit ID, version and source (never credentials or config content) at startup.

#### Scenario: Repository unreachable with cache
- **WHEN** GitHub cannot be reached and a snapshot for the same source and `CONFIG_REF` exists
- **THEN** the API starts with that snapshot and logs a warning containing its commit ID

#### Scenario: Repository unreachable without cache
- **WHEN** GitHub cannot be reached and no snapshot exists
- **THEN** startup fails

#### Scenario: Rate limited with cache
- **WHEN** GitHub answers with a rate-limit error and a snapshot for the same source and `CONFIG_REF` exists
- **THEN** the API starts with that snapshot and logs a warning

#### Scenario: Reference not found with cache
- **WHEN** GitHub reports the reference as not found and snapshots of that source exist
- **THEN** startup fails

#### Scenario: Invalid commit
- **WHEN** the resolved commit contains an invalid config
- **THEN** startup fails with the validation messages, even if an older snapshot exists

### Requirement: Config identity in chat logs
The `agentConfigVersion` and `agentConfigHash` recorded for an agent run or chat log message SHALL be the `version` (`CONFIG_REF`) and commit ID (`hash`) of the config snapshot in use, so that `(agentName, agentConfigHash)` identifies a stored snapshot row.

#### Scenario: Log attribution
- **WHEN** an agent answers a message while the config is commit `abc…` loaded from `CONFIG_REF=v1.0`
- **THEN** its log rows carry version `v1.0` and hash `abc…`, and `agent_config_snapshots` has a row for `(abc…, <agent name>)` with the definition used

### Requirement: Sample config
The repository SHALL contain, under `docs/config-sample`, a config tree equal in behaviour to the previous hard-coded agent configuration: `langchain-example/config.yml` and `langchain-example/agents/{selector,fault_report,work_order_inquiry,other}.yml`, with the previous model name, token limit, thinking settings, tools, prompts and global constants, plus a README describing how to initialise the config repository and the environment variables.

#### Scenario: Behavioural equality
- **WHEN** the sample is loaded
- **THEN** each agent's model, `maxTokens`, `thinking`, `outputConfig`, `tools` and `systemPrompt`, and the global settings, equal the values of the previous hard-coded definitions

### Requirement: Runtime reload
The system SHALL be able to replace the running Agent Config with a newly loaded one without restarting the process, using the same resolution, validation and snapshot caching as at startup. The replacement SHALL be atomic: a turn that started before it SHALL finish using the config it started with, and turns started after it SHALL use the new one. A failed reload SHALL leave the running config unchanged. The values of `CONFIG_SOURCE`, `CONFIG_REF`, `CONFIG_GITHUB_TOKEN` and `CONFIG_GITHUB_API_URL` that a reload uses SHALL be the effective values of the `runtime-settings` capability, so that a stored value replaces the environment variable of the same name and the environment variables remain the defaults.

#### Scenario: Successful reload
- **WHEN** a reload is requested for a ref that resolves to a new valid commit
- **THEN** new turns use agents, MCP servers and settings from that commit and chat logs record its ref and commit ID

#### Scenario: Failed reload
- **WHEN** the reload fails (unreachable repository, unknown ref, invalid config)
- **THEN** the running config is unchanged and the error names the reference and the source

#### Scenario: Turn in progress
- **WHEN** a reload completes during a running turn
- **THEN** that turn continues and is logged with the config it started with

#### Scenario: Environment defaults
- **WHEN** no stored value exists for `CONFIG_REF`
- **THEN** a reload uses the `CONFIG_REF` environment variable
