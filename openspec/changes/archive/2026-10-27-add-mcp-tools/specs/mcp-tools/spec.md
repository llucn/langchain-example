## ADDED Requirements

### Requirement: Configurable remote MCP servers
The system SHALL read the URLs of its remote MCP servers from environment variables — `MCP_USER_URL`, `MCP_ASSET_URL`, `MCP_LOCATION_URL` and `MCP_WORK_ORDER_URL` — and SHALL NOT contain any MCP URL in source code. A server whose variable is unset or empty SHALL be skipped.

#### Scenario: Configured servers
- **WHEN** all four variables are set and a chat message is sent
- **THEN** the agent connects to the four URLs

#### Scenario: Unconfigured server
- **WHEN** `MCP_ASSET_URL` is unset
- **THEN** no connection to an asset server is attempted and the other servers are still used

### Requirement: Visitor ID token authentication
The system SHALL authenticate to every MCP server with the Cognito ID token the visitor sent to the API (`Authorization: Bearer <id token>`), forwarded unchanged, and SHALL NOT use any other credential. When the request carries no token (e.g. `AUTH_ENABLED=false`), the system SHALL NOT call any MCP server. The token SHALL NOT be written to logs or persisted.

#### Scenario: Token forwarded
- **WHEN** a signed-in visitor sends a chat message
- **THEN** each MCP request carries that visitor's bearer token

#### Scenario: No token
- **WHEN** a chat message arrives without a bearer token
- **THEN** no MCP server is contacted and the agent runs with its local tools only

### Requirement: MCP tools for the agent
For each agent run the system SHALL load the tools of every reachable configured MCP server and give them to the agent next to its local tools. Each MCP tool name SHALL be prefixed with its server name so names are unique across servers and local tools. MCP connections SHALL be created per run and closed when the run ends, whether it succeeds or fails.

#### Scenario: Tools available
- **WHEN** the user asks about an asset
- **THEN** the agent may call an `asset`-prefixed tool and answers from its result

#### Scenario: Connections released
- **WHEN** a run finishes or throws
- **THEN** its MCP connections are closed

### Requirement: MCP failure tolerance
An MCP server that cannot be reached, times out or rejects the token SHALL be skipped for that run with a logged warning naming the server (without the token); the chat reply SHALL still be produced with the remaining tools. A failing MCP tool call SHALL be returned to the agent as a tool result, not abort the run.

#### Scenario: One server down
- **WHEN** the location server is unreachable
- **THEN** the agent still answers using the other servers' tools and `renameSession`

#### Scenario: Token rejected
- **WHEN** a server answers 401
- **THEN** that server is skipped for the run and the others are unaffected
