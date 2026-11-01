## ADDED Requirements

### Requirement: Chat session log
The system SHALL keep one log record per chat session, separate from the chat tables, holding the session id, the user (subject and a display name, empty when authentication is disabled), the application version that created it, the session start time and the session name. A log record SHALL be created when the chat session is created, and for a session that has none when its next message arrives.

#### Scenario: Session started
- **WHEN** a client creates a chat session
- **THEN** a log record exists with the session id, the user, the app version and the session's start time

#### Scenario: Session from before logging
- **WHEN** a message is sent to a session that has no log record
- **THEN** a log record is created for it before the message is logged

#### Scenario: Session renamed
- **WHEN** the session name changes (first message or `renameSession`)
- **THEN** the log record's name is updated

### Requirement: Message event log
The system SHALL write one log record per message event of a chat run, each with a type, the event time, the user, the agent name, the agent config version and hash, the application version, the content and a per-session sequence number. The types SHALL be `user_input` (the user's message), `llm_tool_use` (a model reply that calls tools), `llm_end_turn` (a model reply without tool calls, i.e. the final answer), `agent_tool_result` (the result a tool returned to the agent) and `run_error` (the run failed). Events caused by one user message SHALL share a turn id.

#### Scenario: Plain answer
- **WHEN** a user message is answered without tool calls
- **THEN** two events are logged in order, `user_input` then `llm_end_turn`, sharing a turn id

#### Scenario: Answer using a tool
- **WHEN** the agent calls a tool before answering
- **THEN** events are logged in order: `user_input`, `llm_tool_use` (with the tool name, id and arguments), `agent_tool_result` (with the tool name and the matching tool call id), `llm_end_turn`

#### Scenario: Routing
- **WHEN** the selector hands over with `selectAgent` and the downstream agent answers in the same run
- **THEN** the selector's `llm_tool_use` and `agent_tool_result` are logged with agent name `selector` and the downstream agent's events with its own name

#### Scenario: Failed run
- **WHEN** the run throws an error
- **THEN** a `run_error` event with the error message is logged and the events logged before it are kept

#### Scenario: Tool error
- **WHEN** a tool fails
- **THEN** its `agent_tool_result` event has status `error` and the error message

### Requirement: Response time and model details
For `llm_tool_use` and `llm_end_turn` events the system SHALL record the duration of the model call, the model name, the token usage and the model's reasoning text when present; for `agent_tool_result` events it SHALL record the duration of the tool execution. A value that cannot be determined SHALL be stored as empty without affecting the chat.

#### Scenario: Durations recorded
- **WHEN** a run contains a model call and a tool call
- **THEN** the LLM event and the tool result event each carry their own duration in milliseconds

#### Scenario: User input has no duration
- **WHEN** a `user_input` event is logged
- **THEN** it has no duration

### Requirement: Agent config attribution
Each event with an agent SHALL record the agent config version and a config identifier, and the system SHALL store each distinct definition once as a snapshot identified by that identifier. For the current code-defined configuration the identifier is the SHA-256 hash of the agent's full definition (model, parameters, tools, system prompt); when the Agent Config is later kept in a Git repository the identifier will be the Git commit ID and the version the tag or branch name, without a change to the log structure. Runtime prompt parts (selector turn, routing summary) SHALL be recorded in the event metadata.

#### Scenario: Same definition
- **WHEN** many events are logged for an unchanged agent definition
- **THEN** they share one hash and one snapshot exists

#### Scenario: Prompt edited without a version bump
- **WHEN** the definition's system prompt changes but its version label does not
- **THEN** new events carry a different hash and a new snapshot is stored

### Requirement: Logs survive session deletion
Deleting a chat session SHALL NOT delete its log records; the session's log record SHALL be marked with the deletion time.

#### Scenario: Delete a session
- **WHEN** a user deletes a chat session that has logged events
- **THEN** the chat session and its chat messages are gone, the log session and its events remain, and the log session shows a deletion time

### Requirement: Logging never breaks the chat
A failure to write a log record SHALL be reported in the application log only and SHALL NOT change the chat response, the streamed events or the stored chat messages.

#### Scenario: Log database write fails
- **WHEN** inserting a log record fails during a run
- **THEN** the user still receives the answer and the failure is recorded in the application log

### Requirement: Bounded and safe content
The system SHALL cap the stored size of each content, reasoning and tool output field (64 KB) and flag the record as truncated when it was cut, and SHALL NOT store credentials such as the user's token in any log record.

#### Scenario: Oversized tool result
- **WHEN** a tool returns more than the cap
- **THEN** the stored content is cut to the cap and the record is flagged truncated

### Requirement: Ordering and application version
Events of a session SHALL have unique, increasing sequence numbers assigned atomically so concurrent runs cannot collide. The application version SHALL come from `APP_VERSION`, else the API package version, else `unknown`, and SHALL be stored on the session and on each event.

#### Scenario: Concurrent messages
- **WHEN** two messages of one session are processed at the same time
- **THEN** all their events get distinct sequence numbers

#### Scenario: Version from environment
- **WHEN** `APP_VERSION` is set to `1.4.0`
- **THEN** new sessions and events record app version `1.4.0`
