## ADDED Requirements

### Requirement: Recorded memories
The chat log SHALL record the memory texts injected into a run in the metadata of its model events, and a replay SHALL inject exactly the recorded memories into both the old-config and the proposed-config run, never reading `user_memories`.

#### Scenario: Same memories in both runs
- **WHEN** a case whose original run had two injected memories is replayed
- **THEN** both the old and the new run see those two memories in their prompt, even if the user's memories changed since

#### Scenario: Log without memories
- **WHEN** the logged run had no memory block
- **THEN** the replayed prompts have none either

## MODIFIED Requirements

### Requirement: Replay without side effects
The system SHALL replay a reviewed turn with a given agent config without contacting any MCP server and without persisting a chat session, chat message or chat log. Tools that have side effects on stored state (`renameSession`, `saveMemory`, `forgetMemory`) SHALL be replaced by recorders that change nothing.

#### Scenario: No MCP traffic
- **WHEN** a replay runs
- **THEN** no connection to any server in `mcpServers` is opened

#### Scenario: Nothing persisted
- **WHEN** a replay finishes
- **THEN** no new row exists in `chat_sessions`, `chat_messages`, `chat_log_sessions`, `chat_log_messages` or `user_memories`, and no memory was changed or deleted
