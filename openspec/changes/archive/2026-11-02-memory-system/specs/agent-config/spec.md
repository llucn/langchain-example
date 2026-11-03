## MODIFIED Requirements

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
