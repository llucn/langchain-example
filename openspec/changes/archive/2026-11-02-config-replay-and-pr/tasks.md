## 1. Prerequisite refactor

- [x] 1.1 Add the optional `mcp?: McpConnection` run input to `AgentService.run` (used instead of `connectMcp` when given); keep the existing `agent.service` and multi-agent specs green and add a spec for the injected connection

## 2. Replay

- [x] 2.1 Implement `RecordedMcp`: tools built from the proposal's tool inventory (name, description, JSON input schema, grouped by server); recorded results loaded unclipped from `chat_log_messages`; exact match on name plus canonical JSON arguments, each result consumed once in order; placeholder result and `unrecorded` flag for other calls
- [x] 2.2 Implement replay of one turn with a separate `AgentService` per config (old config from the snapshot, proposed config assembled from the file texts), a stub `sessions` repository that records `update` instead of writing, history loaded unclipped from the log and trimmed to `maxContextMessages`, entry agent or selector for `routing`
- [x] 2.3 Tests: recorded match, unrecorded `createWorkOrder` call, no MCP connection opened, no rows written to chat or chat log tables, selector entry for `routing`

## 3. Judge and regression set

- [x] 3.1 Implement the judge with a zod verdict schema (`improved|same|regressed|inconclusive`, reason); `inconclusive` without a model call when there is no comment and no expected result
- [x] 3.2 Implement the regression set: every Good message review of the same agent, most recent first, replay concurrency limit 3, per-replay timeout, per-replay error isolation
- [x] 3.3 Add entity `ImprovementReplay`, the `published` status and `branch`/`prUrl` columns, and a migration
- [x] 3.4 Wire replay into generation after the Proposal step (skipped, with a note, when there is no diff or the tool inventory could not be read), store results, keep the proposal `generating` until done; test the labeled `fault_report` case end to end with fake models, including a `regressed` regression case and a failing replay that does not fail the proposal

## 4. Pull request

- [x] 4.1 Implement `GitHubWriter` beside `GitHubClient` using `CONFIG_GITHUB_TOKEN` (default branch head, blobs, tree, commit, ref, pull request) with the same headers, error mapping and redaction; map 403/404 on writes to the "needs Contents and Pull requests write access" error; extend the GitHub spec tests with a fake fetch
- [x] 4.2 Implement publish: status guard, local-source and missing-token checks, default-branch staleness check (409 and stale mark), branch `improvement/<short-id>`, one commit, PR body with rationale, review ids and replay summary (regressions first), atomic `published` update with branch and URL
- [x] 4.3 Add the publish endpoint (`409` when not available, not `ready` or already published); tests for double publish, stale base, missing token, permission error and token redaction

## 5. Web

- [x] 5.1 Show replay results on the proposal detail page: old and new output with tool calls, `unrecorded` marks, verdict badges, highlighted regressions, the "each side ran once" notice
- [x] 5.2 Add the "Create pull request" confirmation dialog (diff, rationale, replay results), hidden when publishing is unavailable, and show the PR link and `published` status afterwards
- [x] 5.3 Web tests for view helpers (verdict rendering, availability rules, dialog contents)

## 6. Verification

- [x] 6.1 Run lint, typecheck and all unit tests for `api`, `web` and `shared`
- [x] 6.2 Manually run the labeled `fault_report` review: replay shows an `unrecorded` `work_order_createWorkOrder` call judged `improved`, and the regression replays of Good reviews have verdicts
- [ ] 6.3 Publish once against a throwaway config repository with the owner-confirmed token and check the branch, single commit and open pull request, and that nothing was merged
- [x] 6.4 Document replay, the judge and publishing (token permissions) in the README and `docs/config-sample/README.md`
