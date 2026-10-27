## MODIFIED Requirements

### Requirement: Environment-driven model connection
The system SHALL call a Claude model through a LangChain agent, reading the endpoint from `MODEL_BASE_URL` and the credential from `MODEL_API_KEY` through the application environment loader, and SHALL NOT contain either value in source code or in an agent definition. The model name, token limit, thinking mode (adaptive thinking) with its effort level, and the system prompt SHALL be fixed in code per agent definition (see the `multi-agent` capability); the maximum context SHALL be fixed in code and common to all agents.

#### Scenario: Configured connection
- **WHEN** both variables are set and a chat message is sent
- **THEN** every agent calls the model at `MODEL_BASE_URL` authenticated with `MODEL_API_KEY`

#### Scenario: Missing configuration
- **WHEN** either variable is unset and a chat message is sent
- **THEN** the call fails with an error that names the missing variable, and the API keeps serving other requests

### Requirement: renameSession tool
The `fault_report`, `work_order_inquiry` and `other` agents SHALL have a `renameSession` tool taking only a `name`, which sets the name of the current chat session; the `selector` SHALL NOT have it. The name SHALL have whitespace collapsed and be truncated to 80 characters; an empty name SHALL be rejected without changing the session. The system prompt of each of these agents SHALL instruct it to summarize the conversation into a short title (at most 30 characters, in the user's language) and call `renameSession` in its first reply of a session and when the topic changes substantially.

#### Scenario: Agent names the session
- **WHEN** the first message of a session is answered by a downstream agent
- **THEN** that agent calls `renameSession` with a short summary title and the session takes that name

#### Scenario: Empty name
- **WHEN** the tool is called with a blank name
- **THEN** it reports failure and the session name is unchanged

#### Scenario: Selector cannot rename
- **WHEN** the selector is the current agent
- **THEN** `renameSession` is not among its tools

### Requirement: MCP tools in the agent
The tools of an agent SHALL be the local tools and the MCP servers listed in its definition; the tools loaded from a listed MCP server (see the `mcp-tools` capability) SHALL be available to that agent and to no agent that does not list the server. The system prompt of an agent that lists MCP servers SHALL tell it to use those tools for the matching questions.

#### Scenario: Tool set
- **WHEN** a run starts with all MCP servers reachable and the current agent is `fault_report`
- **THEN** the agent has `renameSession` and the tools of the `user`, `location`, `asset` and `work_order` servers, and no other tools

#### Scenario: Agent without MCP servers
- **WHEN** the current agent is `other`
- **THEN** it has `renameSession` only

### Requirement: Tool context injection
Values the LLM must not choose (such as the session id, the visitor's ID token and repositories) SHALL be passed as context, not as tool arguments: per-run values (the session id, the visitor's ID token and the session's active agent) SHALL be supplied by the caller of `AgentService.run`, and shared handles (repositories) SHALL be held by `AgentService`. Each local tool SHALL be created by a factory that receives this context, and a tool's schema SHALL contain only the arguments the LLM is meant to provide.

#### Scenario: Session id is not an LLM argument
- **WHEN** `renameSession` is invoked in a run for session X
- **THEN** it updates session X and its schema exposes only `name`

#### Scenario: ID token is not an LLM argument
- **WHEN** the agent calls an MCP tool
- **THEN** the visitor's ID token is sent by the MCP connection and does not appear in any tool schema or argument
