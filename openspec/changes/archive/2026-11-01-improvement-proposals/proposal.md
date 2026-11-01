## Why

Reviewers now mark chat sessions and messages Good or Bad with comments and expected results, and every logged event carries the Agent Config commit it ran under. Nothing yet turns those reviews into better agents: an admin has to read each Bad review, work out whether the prompt, a tool or a setting is at fault, and edit the config repository by hand. The first labeled review shows why this needs more than "rewrite the prompt": the reviewer wants `fault_report` to create a work order, but its prompt says "You cannot create work orders" while the `work_order_createWorkOrder` MCP tool exists. This change delivers the first half of the self-evolution loop: diagnose Bad reviews and produce a stored config improvement proposal that an admin reads and applies to the config repository by hand. Replaying proposals and opening pull requests follow in the change `config-replay-and-pr`.

## What Changes

- An admin selects Bad message reviews on the Log Review page and clicks "Generate improvement" (manual trigger only).
- A **Case Builder** (plain code) assembles each review into a case: the conversation up to the reviewed event, the tool calls and the recorded MCP results, the reviewer's comment and expected result, and the config snapshot (`agent_config_snapshots`) the session ran under.
- A **Diagnosis agent** classifies the root cause of each case (`prompt`, `tool_missing`, `tool_config`, `settings`, `routing`, `label_unclear`, `insufficient_evidence`) with evidence from the log and a confidence, using the tool inventory of the agent's MCP servers.
- A **Proposal agent** turns the diagnoses of one agent into a minimal change to the config files (`agents/*.yml` including `selector.yml`, and `settings` in `config.yml`) with a rationale citing the review ids. `tool_missing`, `label_unclear` and `insufficient_evidence` diagnoses produce a note, not a diff. Code, not the model, enforces what may change and validates the result.
- Proposals are stored with their cases and diagnoses. An admin reads a proposal in the UI, copies the unified diff or the proposed file text, applies it to the config repository by hand, or discards it.
- The review tag vocabulary gains `stop_condition` (the agent kept asking when it should have finished) and `missing_capability` (the agent lacks a tool or permission it needs).
- The `difference` attribute is removed from the review data structure (shared types, entity property, API); the database column stays untouched.
- The sample config's `fault_report` prompt drops "You cannot create work orders" and tells the agent to create the work order with `work_order_createWorkOrder`, as the first case this flow is meant to produce.

## Capabilities

### New Capabilities
- `improvement-proposals`: generating, storing and reviewing config improvement proposals from Bad reviews; the Case Builder, Diagnosis and Proposal agents; the admin API and page.

### Modified Capabilities
- `chat-log-review`: tag list gains `stop_condition` and `missing_capability`; the `difference` attribute leaves the data structure.

## Impact

- API (`apps/api`): new `improvement` module beside `chat-log`; new tables for proposals and cases (migration).
- Shared (`packages/shared`): review tags, `difference` removed from types, proposal types.
- Web (`apps/web`): "Generate improvement" action on Log Review, a proposal list and detail page, tag chips for the new tags.
- Environment: `EVOLUTION_MODEL` (default `claude-sonnet-5-5`) and `EVOLUTION_MAX_TOKENS`; the config repository is only read, with the existing `CONFIG_GITHUB_TOKEN`.
- Cost and safety: extra LLM calls per generation; no change to the runtime chat path, and nothing reaches the config repository without an admin applying it.
- Out of scope (follow-up change `config-replay-and-pr`): replay with recorded MCP results, LLM judge and regression set, pull request creation. Also out of scope: automatic triggers, LLM reviewers, automatic merge or release, post-release version comparison, session-level reviews as input.
