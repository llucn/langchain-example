## ADDED Requirements

### Requirement: Environment-driven model connection
The system SHALL call a Claude model through a LangChain agent, reading the endpoint from `MODEL_BASE_URL` and the credential from `MODEL_API_KEY`, and SHALL NOT contain either value in source code. Model name, system prompt, maximum context, token limit and thinking budget SHALL be fixed in code.

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
