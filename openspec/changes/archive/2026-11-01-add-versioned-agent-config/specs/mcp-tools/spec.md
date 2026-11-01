## MODIFIED Requirements

### Requirement: Configurable remote MCP servers
The system SHALL take the set of its remote MCP servers and their URLs from the `mcpServers` block of the Agent Config, which maps each server name to a literal URL, and SHALL NOT read MCP URLs from environment variables or contain any MCP URL in source code. A server whose URL is empty SHALL be skipped.

#### Scenario: Configured servers
- **WHEN** the config declares `user`, `asset`, `location` and `work_order` with URLs and a chat message is sent
- **THEN** the agent connects to the four URLs

#### Scenario: Unconfigured server
- **WHEN** the config's `asset` URL is empty or the `asset` entry is absent
- **THEN** no connection to an asset server is attempted and the other servers are still used

#### Scenario: Server defined in the config only
- **WHEN** the config declares a server `billing` with a URL and an agent lists `billing`
- **THEN** the agent connects to it and can use its tools

#### Scenario: Environment variable ignored
- **WHEN** `MCP_USER_URL` is set in the process environment
- **THEN** it has no effect on the `user` server's URL
