## 1. Review vocabulary, `difference` and sample config

- [x] 1.1 Add `stop_condition` and `missing_capability` to `REVIEW_TAGS` in `packages/shared`, and show them as tag chips on the Log Review page
- [x] 1.2 Remove `difference` from the shared `ChatLogReview` type, the entity property and the review response mapping; keep the DB column (shared type and API already had no `difference`; only the entity property remained). `migration:generate` would propose dropping the column (and many pre-existing index/constraint renames, since the migrations are hand-written), so no migration is generated for it
- [x] 1.3 Update review service and web tests for the new tags and the missing `difference`
- [x] 1.4 Edit `docs/config-sample/langchain-example/agents/fault_report.yml`: drop "You cannot create work orders", instruct to create the work order with `work_order_createWorkOrder` when details are complete or the user cannot provide more (asset optional), and stop asking; check `selector.yml` and the sample README for statements that contradict it

## 2. Data model and settings

- [x] 2.1 Add entities `ImprovementProposal` and `ImprovementCase` and a migration (new tables only, statuses as in the design)
- [x] 2.2 Add env settings `EVOLUTION_MODEL` (default `claude-sonnet-5-5`) and `EVOLUTION_MAX_TOKENS` to `config/env.ts` and `.env.example`
- [x] 2.3 Add proposal, case and diagnosis types to `packages/shared`
- [x] 2.4 Create the `apps/api/src/improvement` module (admin guard, registered in `app.module`), with the startup sweep that sets stale `generating` proposals to `failed`

## 3. Case Builder and tool inventory

- [x] 3.1 Implement the Case Builder: reviewed turn, history, tool calls with recorded results, review text, config snapshot lookup by `(agentConfigHash, agentName)`; mark a case insufficient when the snapshot is missing
- [x] 3.2 Implement the tool inventory: connect with the admin's token via `connectMcp`, list tool names, descriptions and input schemas per agent, close; return "unavailable" when no token or unreachable
- [x] 3.3 Unit tests for case assembly (including a missing snapshot and multi-turn history) and the inventory fallback

## 4. Diagnosis and Proposal agents

- [x] 4.1 Implement the shared evolution model factory (model, max tokens, connection via `modelConnection`, no tools)
- [x] 4.2 Implement the Diagnosis step with a zod output schema, comment/expected-result precedence over tags, and the rule that `tool_missing`/`tool_config` need an inventory
- [x] 4.3 Implement the config change checker (allowed files and keys, `selector.yml` only for `routing`, tools reference only declared servers/local tools, `mcpServers`/`model`/`env` unchanged) and in-memory validation through the existing render and validate pipeline
- [x] 4.4 Implement the Proposal step with retry feedback (max two), the service-side unified diff, rationale and notes for non-change layers
- [x] 4.5 Tests: checker accepts a prompt-only change and rejects an MCP URL change, an undeclared server and invalid YAML; Proposal produces notes only for `tool_missing`; use fake model responses

## 5. Orchestration and API

- [x] 5.1 Implement `ImprovementService`: group reviews per agent, create proposals, run case building, diagnosis and proposal in the background with a concurrency limit of 2, persist status transitions and errors
- [x] 5.2 Add endpoints: create (`202`, validation: Bad message reviews only, at most 10), list, get, discard; follow the chat-log-review controller conventions and the admin guard
- [x] 5.3 Tests for the validation errors (Good review, session-level review, more than 10), grouping per agent and the restart sweep

## 6. Web

- [x] 6.1 Add the review selection and the "Generate improvement" action to the Log Review page (only Bad message reviews selectable) and navigate to the created proposal
- [x] 6.2 Add the proposals list page and navigation entry (admin only)
- [x] 6.3 Add the proposal detail page: status with polling while `generating`, diagnoses with evidence, base commit and source, unified diff, rationale, notes, per-file proposed text with Copy actions, Discard
- [x] 6.4 Web tests for view helpers (selection rules, status polling, diff rendering)

## 7. Verification

- [x] 7.1 Run lint, typecheck and all unit tests for `api`, `web` and `shared`
- [x] 7.2 Manually run the labeled `fault_report` Bad review through generation against a local config, and check the diagnosis is `prompt` and the diff removes the "cannot create work orders" sentence
- [x] 7.3 Document the new env variables and the flow in the README
