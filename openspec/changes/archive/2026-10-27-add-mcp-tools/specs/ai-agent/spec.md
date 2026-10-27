## ADDED Requirements

### Requirement: MCP tools in the agent
The agent's tools SHALL be `renameSession` plus the tools loaded from the configured MCP servers (see the `mcp-tools` capability). The system prompt SHALL tell the agent to use the MCP tools for questions about users, assets, locations and work orders.

#### Scenario: Tool set
- **WHEN** a run starts with all MCP servers reachable
- **THEN** the agent has `renameSession` and the MCP tools, and no other tools

## MODIFIED Requirements

### Requirement: Tool context injection
Values the LLM must not choose (such as the session id, the visitor's ID token and repositories) SHALL be passed as context, not as tool arguments: per-run values (the session id and the visitor's ID token) SHALL be supplied by the caller of `AgentService.run`, and shared handles (repositories) SHALL be held by `AgentService`. Each local tool SHALL be created by a factory that receives this context, and a tool's schema SHALL contain only the arguments the LLM is meant to provide.

#### Scenario: Session id is not an LLM argument
- **WHEN** `renameSession` is invoked in a run for session X
- **THEN** it updates session X and its schema exposes only `name`

#### Scenario: ID token is not an LLM argument
- **WHEN** the agent calls an MCP tool
- **THEN** the visitor's ID token is sent by the MCP connection and does not appear in any tool schema or argument

## REMOVED Requirements

### Requirement: getWeather tool
**Reason**: The agent no longer uses local demo tools; real data comes from the MCP servers.
**Migration**: None for users. The `getWeather` code stays in the repository but is not registered with the agent.

### Requirement: getUsers tool
**Reason**: Replaced by the `user` MCP server's tools.
**Migration**: Use the `user`-prefixed MCP tools. The `getUsers` code stays in the repository but is not registered with the agent.

### Requirement: sendMail tool
**Reason**: The mock mail tool is no longer offered to the agent.
**Migration**: None. The `sendMail` code stays in the repository but is not registered with the agent.
