# multi-agent Specification

## Purpose
Routing chat messages from a selector agent to downstream agents inside one agent run, driven by agent state, and remembering the active agent per session.
## Requirements
### Requirement: Agent definitions in code
The system SHALL obtain its agents from the Agent Config (see the `agent-config` capability), not from source code; the shipped sample defines the names `selector`, `fault_report`, `work_order_inquiry` and `other`. A definition SHALL contain a model name, token limit, thinking settings, system prompt and the list of tools the agent may use, each tool being either a local tool by name or an MCP server by name. A definition SHALL NOT contain the model endpoint or a credential unless it is the optional `model` block of the Agent Config, and SHALL NOT contain an MCP URL. The agents `selector` and `other` SHALL always exist; every other loaded agent is a downstream agent the selector may route to.

#### Scenario: Registry content
- **WHEN** the config of `docs/config-sample` is loaded
- **THEN** it holds exactly the four agents, and none of their definitions contains `MODEL_BASE_URL`, `MODEL_API_KEY` or an MCP URL

#### Scenario: Added agent
- **WHEN** the config adds `agents/billing.yml`
- **THEN** `billing` is a valid `agentName` for `selectAgent` after the next start

### Requirement: State-driven agent switching
The system SHALL run every chat message through a single agent whose state holds the name of the current agent. Before each model call the system SHALL apply the current agent's definition: its system prompt, model settings and only the tools its definition lists. Tools not listed for the current agent SHALL NOT be offered to the model.

#### Scenario: Downstream agent configuration applied
- **WHEN** the current agent is `work_order_inquiry`
- **THEN** the model call uses that agent's system prompt and offers only `renameSession` and the tools of the `user` and `work_order` MCP servers

#### Scenario: Selector configuration applied
- **WHEN** the current agent is `selector`
- **THEN** the model call offers only `selectAgent`

### Requirement: New sessions start at the selector
A chat session SHALL have an active agent that is `selector` when the session is created. Sessions that exist before this capability is deployed SHALL also start at `selector`.

#### Scenario: First message
- **WHEN** the first message of a new session is sent
- **THEN** the run starts with the `selector` agent

### Requirement: selectAgent routing
The selector SHALL route with a `selectAgent` tool taking `agentName` (one of `fault_report`, `work_order_inquiry`, `other`), `confidence` (a number from 0 to 1) and `summary` (text). On a successful call the current agent SHALL become `agentName` and the same run SHALL continue with the new agent, so the user's message is answered in the same request. The summary SHALL be given to the new agent in its system prompt as the routing summary. A call with an unknown agent name or `selector` SHALL be rejected without changing the current agent.

#### Scenario: Clear fault report
- **WHEN** the user writes "The payment gateway has been throwing 500 errors since this morning." and the selector calls `selectAgent("fault_report", 0.97, "...")`
- **THEN** the current agent becomes `fault_report` and its reply is the answer to that message

#### Scenario: Summary reaches the downstream agent
- **WHEN** `selectAgent` succeeds with a summary
- **THEN** the downstream agent's next model call has the summary in its system prompt

#### Scenario: Unknown agent
- **WHEN** the selector calls `selectAgent("billing", 0.9, "...")`
- **THEN** the call is rejected, the current agent stays `selector` and the selector can try again

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

### Requirement: Active agent persists across messages
The system SHALL store the current agent of a session after each message and start the next message of that session with it. A stored agent name that is no longer defined SHALL be treated as `selector`. While the active agent is not `selector`, the selector SHALL NOT run.

#### Scenario: Follow-up message
- **WHEN** a session was routed to `fault_report` and the user sends another message
- **THEN** the run starts with `fault_report` and the selector is not consulted

#### Scenario: Selector still clarifying
- **WHEN** the selector replied with a clarifying question without routing
- **THEN** the stored agent stays `selector` and the user's answer goes to the selector

#### Scenario: Removed agent
- **WHEN** the stored agent name is not in the registry
- **THEN** the run starts with `selector`

### Requirement: Downstream agent prompts
The `fault_report` agent SHALL gather the details of a fault (affected asset or system, location, symptom, since when, impact), check related assets, locations and existing work orders through its tools, and SHALL NOT claim a work order was created. The `work_order_inquiry` agent SHALL answer questions about work orders from the work-order tools only. The `other` agent SHALL handle conversation outside those two topics without business tools. Every agent SHALL answer in the language of the user.

#### Scenario: Fault report details
- **WHEN** a user reports a fault without saying where it happened
- **THEN** the `fault_report` agent asks for the missing details

#### Scenario: No invented data
- **WHEN** the work-order tools return no match for the requested id
- **THEN** the `work_order_inquiry` agent says it found none and does not make up a status

