## Context

Today the loop is open at both ends. Reviews live in `chat_log_reviews` (rating, tags, comment, `expectedResult`); every `chat_log_messages` row carries `agentName`, `agentConfigVersion` and `agentConfigHash`, and `agent_config_snapshots` holds the rendered definition of each config commit (`definition`, `settings`, `source`). The config lives in a private GitHub repository that the API reads through the GitHub REST API (`GitHubClient`, `CONFIG_GITHUB_TOKEN`, tarball download). Agents run through `AgentService.run`, which builds a LangChain agent from the active config and the MCP tools of the config's `mcpServers`, connected with the visitor's JWT (`connectMcp`).

The one labeled Bad review that exists is instructive: its `fault_report` prompt says "You cannot create work orders", the `work_order_createWorkOrder` MCP tool exists, and the reviewer wants the agent to stop asking questions and create the work order. The tag the reviewer picked (`too_verbose`) does not describe that. The right fix is a prompt change that depends on knowing which tools exist; the pipeline must therefore see the tool inventory, not only the log, and must not trust tags blindly.

This is the first of two changes. This one ends with a stored proposal that an admin applies by hand; `config-replay-and-pr` adds replay and the pull request on top of the same tables. Stakeholders: admins (reviewers and approvers). Constraint: the evolution code runs inside the NestJS API and never writes to the config repository.

## Goals / Non-Goals

**Goals:**
- From selected Bad message reviews, produce a stored, inspectable improvement proposal: diagnoses with evidence, a minimal config diff, and a rationale citing review ids.
- Make the proposal easy to apply by hand (diff, full proposed file text, copy buttons).
- Keep proposals attributable (which reviews, which base commit) and auditable.
- Make the Case, Diagnosis and Proposal shapes reusable by the replay and pull request change.

**Non-Goals:**
- Replay, judging, regression checks and pull requests (change `config-replay-and-pr`).
- Automatic triggers (thresholds, schedules), LLM reviewers, automatic merge or release, post-release version comparison.
- Evolving anything but the config files (`agents/*.yml`, `settings`): no code, MCP server, model or secret changes.
- Session-level reviews as input (they have no target event).

## Decisions

### 1. One `improvement` module in the API, agents as typed pipeline steps

`apps/api/src/improvement/` beside `chat-log`, with these units: `case-builder` (plain code), `diagnosis.agent`, `proposal.agent`, `config-change.checker`, `improvement.service` (orchestration and persistence), controller. "Agents" here are single structured-output model calls (`ChatAnthropic.withStructuredOutput` with zod schemas), not tool-using loops: each has one narrow job and a verifiable output, and a fixed pipeline is easier to test and bound in cost than a free-running planner.

*Alternatives:* one autonomous agent with tools for reading logs and editing config (rejected: unbounded cost, harder to audit, prompt-injection surface from log content); a separate service (rejected for now: needs the same DB, config loader and GitHub client).

### 2. Evolution models are configured apart from runtime agents

`EVOLUTION_MODEL` (default `claude-sonnet-5-5`) and `EVOLUTION_MAX_TOKENS` in the API environment; the connection (`MODEL_BASE_URL`/`MODEL_API_KEY`, or the config's `model` block via `modelConnection`) is shared. The evolution prompts are code, not config: they must not be changed by the config they are evaluating. The model is separately settable so it can be raised later without touching runtime agents.

### 3. Case = reviewed event + evidence, built by code

For a Bad message review the Case Builder loads: the turn (`turnId`) up to and including the reviewed event, the preceding turns of the session as history, every tool call with its recorded result, the review (comment, expected result, tags), the event's `agentName`, and the `agent_config_snapshots` row for `(agentConfigHash, agentName)` together with the commit's `settings`. It stores a snapshot of that evidence with the case so a proposal stays explainable even if the session is later purged. Tags are passed as hints only; the Diagnosis prompt states that comment and expected result take precedence.

### 4. Diagnosis sees the tool inventory

Whether a tool "is missing" cannot be derived from the log (only used tools appear). `improvement.service` connects to the config's MCP servers with the admin's own token (`connectMcp`, the same call chat uses), lists tool names, descriptions and input schemas, and closes the connection; no tool is invoked. The inventory records which agent's `tools` entries expose which tool. Without an inventory (auth disabled, server unreachable) Diagnosis may not answer `tool_missing` or `tool_config` and falls back to `insufficient_evidence` for those cases.

Output per case (zod): `layer` (`prompt` | `tool_missing` | `tool_config` | `settings` | `routing` | `label_unclear` | `insufficient_evidence`), `rootCause`, `evidence` (event seq numbers and quotes), `confidence` (0–1), `suggestedAction`.

### 5. Proposal agent edits only an allowlisted surface

The Proposal agent receives the diagnoses of one agent's cases (one proposal per agent), the current files of the running config commit, and the tool inventory. It returns, per changed file, the complete new file text plus a rationale per change. The service then checks mechanically, independent of the model:

- only `agents/<name>.yml` of the diagnosed agents and the `settings` block of `config.yml` differ from the base; for `routing` diagnoses `agents/selector.yml` counts as a diagnosed agent;
- within an agent file only `systemPrompt`, `tools`, `outputConfig` and `maxTokens` differ; `tools` entries may reference only local tools and MCP servers already declared in `mcpServers`;
- `mcpServers`, `model` and `env` are untouched;
- the result passes the existing render and validation pipeline (placeholders, schema) in memory.

A failed check is fed back to the model for up to two retries, then the proposal ends as `failed` with the error. `tool_missing`, `label_unclear` and `insufficient_evidence` diagnoses produce a "notes" entry (for the admin) and never a diff. The unified diff is produced by the service, not the model.

*Alternative:* model emits patch operations (rejected: brittle against YAML block scalars; full text plus a service-side structural check is simpler and safer).

### 6. Proposals and cases are persisted; generation is asynchronous

Tables (one migration): `improvement_proposals` (id, `agentName`, `status` `generating|ready|failed|discarded`, `baseCommit`, `baseSource`, `createdBy`, `files` jsonb holding path, base text and proposed text per file, `diff`, `rationale`, `notes` jsonb, `error`, timestamps), `improvement_cases` (proposal id, `reviewId`, evidence snapshot jsonb, `diagnosis` jsonb). The follow-up change adds the status `published`, the branch and PR columns and a replay table. `POST` returns `202` with the proposal ids in `generating`; work runs in-process behind a small concurrency limit (2); the page polls. At API start any proposal still `generating` is set to `failed`. No queue is added: volume is manual and low. A generation takes at most 10 reviews.

### 7. Hand-over is manual

The detail page shows the base commit and source, the file paths inside the config directory, the unified diff, and the full proposed text per file, each with a Copy button. The system makes no request to the config repository beyond reading it, so the existing read token suffices.

### 8. Review vocabulary and `difference`

`REVIEW_TAGS` gains `stop_condition` and `missing_capability` (the DTO validates against the list; the column is free text, so old rows stay valid). `difference` is removed from the shared `ChatLogReview` type, the response mapping and the entity property; the column stays, nullable, in the database. Because the entity no longer maps it, `migration:generate` would propose dropping it: the task list therefore includes checking that a generated migration is empty or removing the drop by hand.

### 9. The first case ships with the sample config

`docs/config-sample/.../fault_report.yml` is edited: the "cannot create work orders" sentence is removed and the prompt says to create the work order with `work_order_createWorkOrder` once the details are complete, or when the user cannot provide more (asset optional), without further questions. This is both the immediate fix for the labeled review and the expected output used to sanity-check the pipeline.

## Risks / Trade-offs

- [Few labels, so proposals overfit one conversation] → Proposals must be minimal and cite review ids; Diagnosis may answer `insufficient_evidence`; an admin applies by hand; replay and regression checks arrive in the follow-up change.
- [Log content is attacker-influenced text fed to the models] → Models only produce structured output; the allowlist, structural check and validation run in code; no tool use in these agents; nothing is applied automatically.
- [A proposal computed against one commit is applied to a newer config by hand] → The page shows the base commit; the admin sees the diff in context.
- [Sonnet-class model may misjudge root cause] → Evidence with event seq numbers and confidence is shown so the admin can verify; the model setting is separate and can be raised.
- [Cost of several model calls per proposal] → One structured call per case for Diagnosis plus one for Proposal; at most 10 reviews per generation.
- [Stuck or long generations] → Async with status, restart sweep to `failed`, per-call timeouts.

## Migration Plan

1. Deploy the migration (new tables only; the `difference` column is untouched).
2. Ship the tag and `difference` change (backwards compatible: stored tags stay valid, clients that sent `difference` never could).
3. Optionally set `EVOLUTION_MODEL` and `EVOLUTION_MAX_TOKENS`.
4. Roll back by removing the module and tables; the log, reviews and config are unaffected.

## Open Questions

- None blocking. Whether proposals should later carry the replay results is handled in `config-replay-and-pr`.
