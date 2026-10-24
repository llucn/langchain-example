## MODIFIED Requirements

### Requirement: Streamed thinking and answer
When a message is sent, the system SHALL run the AI agent and stream, in order, the saved user message, the thinking text, and the saved assistant message. The thinking text SHALL contain the agent's reasoning, each tool call with its arguments, and each tool result, in the order they happened. The saved assistant message SHALL store the same text as its thinking and the agent's final reply as its content. Empty messages SHALL be rejected with 400.

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
