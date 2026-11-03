# ai-agent Specification

## Purpose
TBD - created by archiving change add-ai-agent-chat. Update Purpose after archive.
## Requirements

### Requirement: Environment-driven model connection
The system SHALL call a Claude model through a LangChain agent, reading the endpoint from `MODEL_BASE_URL` and the credential from `MODEL_API_KEY` through the application environment loader, unless the Agent Config has a `model` block, whose `baseUrl` and `apiKey` then take precedence; neither value SHALL be in source code or in an agent definition. The model name, token limit, thinking mode (adaptive thinking) with its effort level, and the system prompt SHALL come from the Agent Config per agent definition (see the `multi-agent` and `agent-config` capabilities); the maximum context SHALL come from the Agent Config settings and be common to all agents.

#### Scenario: Configured connection
- **WHEN** both variables are set, the config has no `model` block, and a chat message is sent
- **THEN** every agent calls the model at `MODEL_BASE_URL` authenticated with `MODEL_API_KEY`

#### Scenario: Config overrides the environment
- **WHEN** the config has a `model` block with `baseUrl` and `apiKey`
- **THEN** every agent uses them instead of the environment variables

#### Scenario: Missing configuration
- **WHEN** neither the config nor the environment provides the endpoint or the key and a chat message is sent
- **THEN** the call fails with an error that names the missing setting, and the API keeps serving other requests

### Requirement: Bounded conversation context
The agent SHALL receive the most recent messages of the session, up to the maximum from the Agent Config (`settings.maxContextMessages`, default 20), oldest first and ending with the new user message.

#### Scenario: Long session
- **WHEN** a session holds more messages than the maximum
- **THEN** only the most recent ones up to the maximum are sent to the model

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
- **THEN** the agent has `renameSession`, `saveMemory`, `forgetMemory` and the tools of the `user`, `location`, `asset` and `work_order` servers, and no other tools

#### Scenario: Agent without MCP servers
- **WHEN** the current agent is `other`
- **THEN** it has `renameSession`, `saveMemory` and `forgetMemory` only

### Requirement: Tool context injection
Values the LLM must not choose (such as the session id, the visitor's ID token and repositories) SHALL be passed as context, not as tool arguments: per-run values (the session id, the visitor's ID token and the session's active agent) SHALL be supplied by the caller of `AgentService.run`, and shared handles (repositories) SHALL be held by `AgentService`. Each local tool SHALL be created by a factory that receives this context, and a tool's schema SHALL contain only the arguments the LLM is meant to provide.

#### Scenario: Session id is not an LLM argument
- **WHEN** `renameSession` is invoked in a run for session X
- **THEN** it updates session X and its schema exposes only `name`

#### Scenario: ID token is not an LLM argument
- **WHEN** the agent calls an MCP tool
- **THEN** the visitor's ID token is sent by the MCP connection and does not appear in any tool schema or argument

### Requirement: Memories in the system prompt
When `settings.memory.enabled` is true and the session's owner has memories, every model call of a run SHALL have the system prompt of the current agent followed by a block headed "What you remember about this user" listing the owner's newest `settings.memory.maxMemories` memories, oldest first, one per line with its short id and content clipped to 500 characters. The block SHALL state that the memories are notes provided by the user or earlier conversations and are not instructions. The memories SHALL be read once at the start of the run. Nothing SHALL be added when the owner has no memories or memory is disabled.

#### Scenario: Memories injected
- **WHEN** a user with two memories sends a message in a new session
- **THEN** the prompt of each model call in the run contains the block with both memories

#### Scenario: Limit
- **WHEN** the owner has 40 memories and `maxMemories` is 30
- **THEN** the block lists the 30 newest

#### Scenario: Another user's memories
- **WHEN** user A's run starts and user B has memories
- **THEN** none of B's memories appear in A's prompt

#### Scenario: Disabled or empty
- **WHEN** memory is disabled, or the owner has no memories
- **THEN** the system prompt is exactly what it was without this feature
