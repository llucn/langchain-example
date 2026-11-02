# improvement-proposals Specification

## Purpose
TBD - created by archiving change improvement-proposals. Update Purpose after archive.
## Requirements
### Requirement: Manual generation from Bad reviews
The system SHALL let an admin select one or more Bad message reviews on the Log Review page and start the generation of improvement proposals with a "Generate improvement" action. Generation SHALL start only on this action; nothing is generated automatically. Reviews SHALL be grouped by the agent of the reviewed event and one proposal SHALL be created per agent. The request SHALL be rejected with 400 when a selected review is not Bad, is a session-level review, or when more than 10 reviews are selected. The call SHALL return `202` with the proposal ids and the work SHALL continue in the background.

#### Scenario: Generate from one review
- **WHEN** an admin selects a Bad review of a `fault_report` message and clicks "Generate improvement"
- **THEN** a proposal for `fault_report` is created in status `generating` and the admin is taken to its page

#### Scenario: Reviews of two agents
- **WHEN** the selected reviews belong to events of `fault_report` and `work_order_inquiry`
- **THEN** two proposals are created, one per agent

#### Scenario: Unsupported review
- **WHEN** a selected review is Good, or is a session-level review
- **THEN** the system responds 400 and creates nothing

### Requirement: Case assembly
For each selected review the system SHALL assemble a case without using a model: the turn of the reviewed event up to and including it, the preceding turns of the session as history, every tool call of those turns with its recorded result, the review's tags, comment and expected result, and the agent config snapshot (definition and settings) identified by the event's `agentConfigHash`. The evidence SHALL be stored with the case.

#### Scenario: Evidence of a case
- **WHEN** a case is built for a Bad review on an `llm_end_turn` event
- **THEN** it contains the conversation, the tool calls with results, the review text and the config the event ran under

#### Scenario: Config snapshot missing
- **WHEN** no snapshot exists for the event's config hash
- **THEN** the case is marked insufficient and its diagnosis is `insufficient_evidence`

### Requirement: Diagnosis of the root cause
The system SHALL classify each case with a model call into exactly one layer: `prompt`, `tool_missing`, `tool_config`, `settings`, `routing`, `label_unclear` or `insufficient_evidence`, with a root cause statement, evidence citing event sequence numbers, a confidence between 0 and 1 and a suggested action. The comment and expected result of the review SHALL take precedence over its tags. The diagnosis SHALL be given the tool inventory (names, descriptions and input schemas of the tools of the agent's MCP servers and local tools); without an inventory the layers `tool_missing` and `tool_config` SHALL NOT be assigned.

#### Scenario: Prompt contradicts an available tool
- **WHEN** the prompt says the agent cannot create work orders, the inventory contains `work_order_createWorkOrder` and the reviewer expects a work order to be created
- **THEN** the diagnosis layer is `prompt` and its evidence names the contradicting prompt sentence and the tool

#### Scenario: Tag disagrees with comment
- **WHEN** a review is tagged `too_verbose` but its comment says the agent should have created a work order instead of asking more
- **THEN** the diagnosis follows the comment

#### Scenario: Tool inventory unavailable
- **WHEN** the MCP servers cannot be reached or the admin has no token
- **THEN** diagnoses cannot be `tool_missing` or `tool_config`, and the proposal records that the inventory was unavailable

### Requirement: Proposal limited to safe config changes
For the diagnoses of one agent the system SHALL ask a model for the new text of the config files that need to change and SHALL check mechanically that: only the diagnosed agents' `agents/<name>.yml` files (`agents/selector.yml` for a `routing` diagnosis) and the `settings` block of `config.yml` differ from the config commit the API runs; in an agent file only `systemPrompt`, `tools`, `outputConfig` and `maxTokens` differ; `tools` reference only local tools and MCP servers already declared in `mcpServers`; `mcpServers`, `model` and `env` are unchanged; and the result passes the Agent Config validation. A failed check SHALL be returned to the model for at most two retries; after that the proposal SHALL be `failed` with the reason. Diagnoses of layer `tool_missing`, `label_unclear` or `insufficient_evidence` SHALL produce a note for the admin and no change. The diff SHALL be computed by the system, not by the model.

#### Scenario: Prompt fix
- **WHEN** the diagnosis is `prompt` for `fault_report`
- **THEN** the proposal changes only `agents/fault_report.yml` and shows a unified diff and a rationale citing the review ids

#### Scenario: Change outside the allowlist
- **WHEN** the model's output also changes an MCP server URL
- **THEN** the check fails, the model is asked to correct it and, if it persists, the proposal fails and nothing is stored as a diff

#### Scenario: Only notes
- **WHEN** every diagnosis is `tool_missing`
- **THEN** the proposal is `ready` with notes describing the missing capability and has no diff

#### Scenario: Routing fix
- **WHEN** the diagnosis layer is `routing`
- **THEN** the proposal may change `agents/selector.yml` under the same checks

#### Scenario: Invalid config
- **WHEN** the proposed files fail Agent Config validation
- **THEN** the failure is fed back to the model; the proposal is never stored `ready` with an invalid config

### Requirement: Proposal storage and status
The system SHALL store each proposal with its status (`generating`, `ready`, `failed`, `discarded`, `published`), the agent, the base config commit and source, the creating admin, the path, base text and proposed text of each changed file, the diff, rationale, notes and error, and, once published, the branch and pull request URL; and SHALL store each case with its review id, evidence and diagnosis, and each replay with its proposal (see `config-replay`). At API start proposals still `generating` SHALL be set to `failed`.

#### Scenario: Restart during generation
- **WHEN** the API restarts while a proposal is `generating`
- **THEN** after start the proposal is `failed` with the reason "interrupted"

#### Scenario: Traceability
- **WHEN** an admin opens a proposal
- **THEN** each change can be traced to its cases and the reviews they came from

#### Scenario: Published proposal
- **WHEN** a proposal has been published
- **THEN** it keeps its branch name and pull request URL and cannot be discarded or published again

### Requirement: Proposal review page
The system SHALL give admins a page listing proposals (newest first, with status, agent and creation time) and a detail page showing the diagnoses with evidence, the base config commit and source, the unified diff, the rationale, the notes, the replay results and the status, and offering "Discard" (a `ready` or `failed` proposal) and "Create pull request" (a `ready` proposal with a diff, when publishing is available). For each changed file the page SHALL show its path in the config directory and its full proposed text, and SHALL offer Copy actions for the diff and for each proposed file text. The replay results SHALL state that each side was run once, and `regressed` verdicts SHALL be highlighted. While a proposal is `generating` the page SHALL refresh its status.

#### Scenario: Inspect a proposal
- **WHEN** an admin opens a `ready` proposal
- **THEN** they see per case the diagnosis, the unified diff, the rationale and the replay verdicts

#### Scenario: Copy for manual application
- **WHEN** the admin clicks Copy on a proposed file
- **THEN** the full proposed text of that file is copied to the clipboard

#### Scenario: Discard
- **WHEN** an admin discards a proposal
- **THEN** its status becomes `discarded` and "Create pull request" is no longer offered

### Requirement: Evolution model configuration
The system SHALL use the model named by `EVOLUTION_MODEL` (default `claude-sonnet-5-5`) and `EVOLUTION_MAX_TOKENS` for the diagnosis and proposal calls, over the same model connection as the runtime agents. The prompts of these calls SHALL be part of the application, not of the Agent Config. These calls SHALL have no tools.

#### Scenario: Separate model
- **WHEN** `EVOLUTION_MODEL` differs from the agents' model
- **THEN** the diagnosis and proposal calls use `EVOLUTION_MODEL` and runtime chats are unaffected

### Requirement: Improvement access control
All improvement endpoints and pages SHALL be limited to admins (see `admin-access`).

#### Scenario: Non-admin
- **WHEN** a non-admin calls an improvement endpoint
- **THEN** the system responds 403

### Requirement: Replay during generation
After a proposal with a diff has been built, the system SHALL replay its target cases and the regression set (see `config-replay`) before the proposal becomes `ready`, and SHALL store the results with the proposal. A proposal without a diff, or whose tool inventory could not be read, SHALL skip replay and say so in its notes.

#### Scenario: Replay before ready
- **WHEN** a proposal with a diff has been built
- **THEN** its status stays `generating` until the replays have finished or failed, then becomes `ready`

#### Scenario: Notes only
- **WHEN** a proposal has notes and no diff
- **THEN** no replay runs and the proposal becomes `ready`

#### Scenario: No tool inventory
- **WHEN** the proposal has a diff but the tool inventory could not be read
- **THEN** no replay runs, a note says why, and the proposal becomes `ready`

### Requirement: Pull request after human confirmation
The system SHALL open a pull request in the config repository for a `ready` proposal with a diff only after an admin confirms in a dialog that shows the diff, rationale and replay results. It SHALL read the repository's default branch, verify that every file to change still has the content the proposal was computed from (else respond 409 and mark the proposal stale), create the branch `improvement/<short-id>`, create one commit with the proposed files, and open a pull request whose description contains the rationale, the review ids and the replay summary (regressions first). It SHALL NOT merge the pull request or push to the default branch. The status change to `published`, with branch and pull request URL, SHALL be atomic so that a repeated request opens no second pull request. Publishing SHALL use `CONFIG_GITHUB_TOKEN` (see `agent-config`).

#### Scenario: Publish
- **WHEN** an admin confirms the pull request for a `ready` proposal
- **THEN** a branch and pull request are created, the proposal becomes `published` and shows the pull request link

#### Scenario: Config changed meanwhile
- **WHEN** a target file on the default branch differs from the proposal's base
- **THEN** the system responds 409, creates no branch and marks the proposal stale

#### Scenario: Double click
- **WHEN** the publish request is sent twice for the same proposal
- **THEN** exactly one pull request is created and the second call responds 409

#### Scenario: Not available
- **WHEN** the config source is a local directory or no `CONFIG_GITHUB_TOKEN` is set
- **THEN** the page does not offer to create a pull request and the endpoint responds 409
