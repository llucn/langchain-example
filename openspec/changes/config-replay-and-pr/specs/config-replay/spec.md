## ADDED Requirements

### Requirement: Replay without side effects
The system SHALL replay a reviewed turn with a given agent config without contacting any MCP server and without persisting a chat session, chat message or chat log. Tools that have side effects on stored state (`renameSession`) SHALL be replaced by recorders that change nothing.

#### Scenario: No MCP traffic
- **WHEN** a replay runs
- **THEN** no connection to any server in `mcpServers` is opened

#### Scenario: Nothing persisted
- **WHEN** a replay finishes
- **THEN** no new row exists in `chat_sessions`, `chat_messages`, `chat_log_sessions` or `chat_log_messages`

### Requirement: Recorded tool results
During replay the system SHALL answer an MCP tool call with the result recorded in the session's log when the tool name and the canonical JSON of the arguments both match, consuming each recorded result at most once in recorded order. A call without a matching recorded result SHALL receive a marked placeholder result stating that no result was recorded and the call was not executed, and SHALL be flagged `unrecorded` in the replay output with its tool name and arguments.

#### Scenario: Matching call
- **WHEN** the replayed agent calls a tool with the same name and arguments as in the log
- **THEN** it receives the recorded result

#### Scenario: New call
- **WHEN** the replayed agent calls `work_order_createWorkOrder`, which has no recorded result
- **THEN** the call is not executed, the agent receives the placeholder result and the output lists the call as `unrecorded` with its arguments

### Requirement: Replay of the reviewed turn under old and new config
For each case the system SHALL replay the turn of the reviewed event twice with identical history (taken from the log, not regenerated), user message, tool stubs and context limit: once with the config the event ran under and once with the proposed config. The entry agent SHALL be the reviewed event's agent, or the selector when the diagnosis layer is `routing`. The proposed config SHALL be loaded from the proposed file texts through the Agent Config rendering and validation, not from the repository.

#### Scenario: Two runs per case
- **WHEN** a proposal with a diff is replayed
- **THEN** each case has an old output and a new output, each with the final text and the ordered tool calls

#### Scenario: Routing case
- **WHEN** the case's diagnosis layer is `routing`
- **THEN** both runs start at the selector

### Requirement: Judged verdicts
The system SHALL judge each replayed case with a model call that receives the review comment, the expected result and both outputs, and returns a verdict (`improved`, `same`, `regressed` or `inconclusive`) with a short reason. A case without comment and expected result SHALL be `inconclusive`. The judge SHALL evaluate the intent and arguments of `unrecorded` calls, not their effects.

#### Scenario: Expected call made
- **WHEN** the expected result is "create a work order without an asset" and the new output calls `work_order_createWorkOrder` without an asset id while the old output asks another question
- **THEN** the verdict is `improved` with a reason

#### Scenario: No expectation
- **WHEN** a review has no comment and no expected result
- **THEN** the verdict is `inconclusive`

### Requirement: Regression set
The system SHALL also replay every Good message review of the same agent, most recent first, under old and new config and judge whether the new output still satisfies what was good. There is no limit on their number. A `regressed` verdict SHALL be shown prominently on the proposal and in the pull request description.

#### Scenario: Good reviews replayed
- **WHEN** the agent has Good message reviews
- **THEN** all of them are replayed and their verdicts are stored with `kind` `regression`

#### Scenario: Regression found
- **WHEN** a regression case is judged `regressed`
- **THEN** the proposal page marks it and the pull request description lists it

#### Scenario: No Good reviews
- **WHEN** the agent has no Good message reviews
- **THEN** only the target cases are replayed
### Requirement: Replay results are advisory and stored
The system SHALL store each replay (kind `target` or `regression`, old and new output, verdict) with its proposal and show it on the proposal page, stating that each side was run once. Replay verdicts SHALL NOT block publishing. A failure of one replay SHALL be stored as an error for that case and SHALL NOT fail the proposal.

#### Scenario: One replay fails
- **WHEN** the model call of one replay errors
- **THEN** that case shows the error, the other cases keep their results and the proposal stays `ready`
