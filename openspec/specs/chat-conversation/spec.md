# chat-conversation Specification

## Purpose

Sending messages, streaming thinking and answers, persisting messages, and the bubble conversation UI.
## Requirements
### Requirement: Messages are persisted
The system SHALL store every user message and assistant reply as a chat message with role, content, timestamp and, for assistant replies, the thinking text, and SHALL return a session's messages oldest first.

#### Scenario: History reload
- **WHEN** a client lists the messages of a session after a completed exchange
- **THEN** it receives the user message followed by the assistant message, including its thinking

### Requirement: Streamed thinking and answer
When a message is sent, the system SHALL run the AI agent and stream, in order, the saved user message, the thinking text, and the saved assistant message. The thinking text SHALL contain the agent's reasoning, each tool call with its arguments, and each tool result, in the order they happened. The saved assistant message SHALL store the same text as its thinking and the agent's final reply as its content. After the assistant message the system SHALL emit the session again so clients receive a name changed by the agent. Empty messages SHALL be rejected with 400.

#### Scenario: Plain question
- **WHEN** the user sends a question that needs no tool
- **THEN** the thinking contains the reasoning and the assistant content is the model's answer

#### Scenario: Tool use
- **WHEN** the user asks about the weather in Paris
- **THEN** the thinking contains the `getWeather` call with its arguments and its result, and the answer is based on that result

#### Scenario: Empty message
- **WHEN** a client sends an empty message
- **THEN** the system responds 400 and stores nothing

#### Scenario: Model failure
- **WHEN** the model call fails or is not configured
- **THEN** the stream emits an `error` event, no assistant message is stored, and the user message remains saved

### Requirement: Bubble conversation view
The web app SHALL present the conversation as chat bubbles (user right, assistant left), show the thinking process live while the server is working, then show the answer with the thinking collapsed above it, and let the user keep sending messages in the same session.

#### Scenario: Live thinking
- **WHEN** the user sends a message
- **THEN** their bubble appears, a "Thinking…" bubble fills with the thinking text, and is replaced by the answer bubble when complete

#### Scenario: Start from a new chat
- **WHEN** the user sends the first message from "New chat"
- **THEN** a session is created, the view switches to it without losing the in-flight exchange, and the session appears in the list

#### Scenario: Continue the conversation
- **WHEN** the user sends another message after an answer
- **THEN** it is appended to the same session

