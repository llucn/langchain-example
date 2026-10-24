## ADDED Requirements

### Requirement: Environment-driven model connection
The system SHALL call a Claude model through a LangChain agent, reading the endpoint from `MODEL_BASE_URL` and the credential from `MODEL_API_KEY`, and SHALL NOT contain either value in source code. Model name, system prompt, maximum context, token limit, the thinking mode (adaptive thinking) and its effort level SHALL be fixed in code.

#### Scenario: Configured connection
- **WHEN** both variables are set and a chat message is sent
- **THEN** the agent calls the model at `MODEL_BASE_URL` authenticated with `MODEL_API_KEY`

#### Scenario: Missing configuration
- **WHEN** either variable is unset and a chat message is sent
- **THEN** the call fails with an error that names the missing variable, and the API keeps serving other requests

### Requirement: Bounded conversation context
The agent SHALL receive the most recent messages of the session, up to a fixed maximum, oldest first and ending with the new user message.

#### Scenario: Long session
- **WHEN** a session holds more messages than the maximum
- **THEN** only the most recent ones up to the maximum are sent to the model

### Requirement: getWeather tool
The agent SHALL have a `getWeather` tool that takes a city name and returns the condition, temperature in °C and humidity.

#### Scenario: Weather question
- **WHEN** the user asks about the weather in a city
- **THEN** the agent calls `getWeather` with that city and answers from the result

### Requirement: getUsers tool
The agent SHALL have a `getUsers` tool that returns registered users (id, email, created time, never the OIDC subject), newest first, with an optional limit defaulting to 10 and capped at 50.

#### Scenario: List users
- **WHEN** the user asks who the registered users are
- **THEN** the agent calls `getUsers` and answers from the result

#### Scenario: Limit cap
- **WHEN** the tool is called with a limit above 50
- **THEN** at most 50 users are returned

### Requirement: sendMail tool
The agent SHALL have a `sendMail` tool taking recipients (non-empty list of strings), a subject and a body. The tool SHALL be a mock: it SHALL NOT send any email and SHALL always report success.

#### Scenario: Send an email
- **WHEN** the user asks the agent to email someone
- **THEN** the agent calls `sendMail` with recipients, subject and body, the tool returns success without sending anything, and the agent tells the user the mail is mocked

### Requirement: renameSession tool
The agent SHALL have a `renameSession` tool taking only a `name`, which sets the name of the current chat session. The name SHALL have whitespace collapsed and be truncated to 80 characters; an empty name SHALL be rejected without changing the session. The system prompt SHALL instruct the agent to summarize the conversation into a short title (at most 30 characters, in the user's language) and call `renameSession` in its first reply of a session and when the topic changes substantially.

#### Scenario: Agent names the session
- **WHEN** the first message of a session is answered
- **THEN** the agent calls `renameSession` with a short summary title and the session takes that name

#### Scenario: Empty name
- **WHEN** the tool is called with a blank name
- **THEN** it reports failure and the session name is unchanged

### Requirement: Tool context injection
Values the LLM must not choose (such as the session id and repositories) SHALL be passed as context, not as tool arguments: per-run values (the session id) SHALL be supplied by the caller of `AgentService.run`, and shared handles (repositories) SHALL be held by `AgentService`. Each tool SHALL be created by a factory that receives this context, and a tool's schema SHALL contain only the arguments the LLM is meant to provide.

#### Scenario: Session id is not an LLM argument
- **WHEN** `renameSession` is invoked in a run for session X
- **THEN** it updates session X and its schema exposes only `name`
