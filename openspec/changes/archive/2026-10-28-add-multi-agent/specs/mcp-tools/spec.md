## MODIFIED Requirements

### Requirement: MCP tools for the agent
For each agent run the system SHALL load the tools of every reachable configured MCP server and group them by server. The tools of a server SHALL be offered to the current agent only when its definition lists that server, next to its local tools. Each MCP tool name SHALL be prefixed with its server name so names are unique across servers and local tools. MCP connections SHALL be created per run and closed when the run ends, whether it succeeds or fails.

#### Scenario: Tools available
- **WHEN** the user asks about an asset and the current agent lists the `asset` server
- **THEN** the agent may call an `asset`-prefixed tool and answers from its result

#### Scenario: Server not listed for the agent
- **WHEN** the current agent is `work_order_inquiry`
- **THEN** no `asset`- or `location`-prefixed tool is offered to it

#### Scenario: Connections released
- **WHEN** a run finishes or throws
- **THEN** its MCP connections are closed
