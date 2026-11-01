## MODIFIED Requirements

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
