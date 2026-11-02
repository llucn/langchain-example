## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: MCP tools in the agent
The tools of an agent SHALL be the local tools and the MCP servers listed in its definition; the tools loaded from a listed MCP server (see the `mcp-tools` capability) SHALL be available to that agent and to no agent that does not list the server. The system prompt of an agent that lists MCP servers SHALL tell it to use those tools for the matching questions.

#### Scenario: Tool set
- **WHEN** a run starts with all MCP servers reachable and the current agent is `fault_report`
- **THEN** the agent has `renameSession`, `saveMemory`, `forgetMemory` and the tools of the `user`, `location`, `asset` and `work_order` servers, and no other tools

#### Scenario: Agent without MCP servers
- **WHEN** the current agent is `other`
- **THEN** it has `renameSession`, `saveMemory` and `forgetMemory` only
