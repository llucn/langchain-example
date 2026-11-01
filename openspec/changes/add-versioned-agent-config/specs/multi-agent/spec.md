## MODIFIED Requirements

### Requirement: Agent definitions in code
The system SHALL obtain its agents from the Agent Config (see the `agent-config` capability), not from source code; the shipped sample defines the names `selector`, `fault_report`, `work_order_inquiry` and `other`. A definition SHALL contain a model name, token limit, thinking settings, system prompt and the list of tools the agent may use, each tool being either a local tool by name or an MCP server by name. A definition SHALL NOT contain the model endpoint or a credential unless it is the optional `model` block of the Agent Config, and SHALL NOT contain an MCP URL. The agents `selector` and `other` SHALL always exist; every other loaded agent is a downstream agent the selector may route to.

#### Scenario: Registry content
- **WHEN** the config of `docs/config-sample` is loaded
- **THEN** it holds exactly the four agents, and none of their definitions contains `MODEL_BASE_URL`, `MODEL_API_KEY` or an MCP URL

#### Scenario: Added agent
- **WHEN** the config adds `agents/billing.yml`
- **THEN** `billing` is a valid `agentName` for `selectAgent` after the next start

### Requirement: Clarification and confidence gate
The selector SHALL ask the user a clarifying question instead of routing when the intent is ambiguous. The system SHALL reject a `selectAgent` call whose confidence is below the configured minimum (`settings.selector.minConfidence`, default 0.5), returning a tool result that tells the selector to ask a clarifying question, unless the selector is on its last user turn (`settings.selector.maxTurns`, default 5). The system SHALL tell the selector which user turn it is on (of the configured maximum), and on the last turn the selector SHALL route, using `other` when the intent is still unclear.

#### Scenario: Low confidence early
- **WHEN** the selector calls `selectAgent("fault_report", 0.4, "...")` on the second user turn with the default settings
- **THEN** the current agent stays `selector` and the selector receives a tool result asking it to clarify

#### Scenario: Fallback on the fifth turn
- **WHEN** the intent is still unclear on the fifth user turn and the selector calls `selectAgent("other", 0.3, "...")` with the default settings
- **THEN** the current agent becomes `other`

#### Scenario: Configured limits
- **WHEN** `settings.selector.maxTurns` is 3 and the selector is on its third user turn with confidence 0.3
- **THEN** the call is accepted and the selector is told it is turn 3 of 3
