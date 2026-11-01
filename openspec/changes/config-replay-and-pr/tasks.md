## 1. Prerequisite refactor

- [ ] 1.1 Behavior-preserving refactor of `AgentService.run` so the tool source (`McpConnection`-shaped) and the persistence/log hooks are injectable; keep the existing `agent.service` and multi-agent specs green

## 2. Replay

- [ ] 2.1 Implement `RecordedMcp`: tools with original names and schemas, exact match on name plus canonical JSON arguments, each result consumed once in order, placeholder result and `unrecorded` flag for other calls
- [ ] 2.2 Implement replay of one turn under a given definition (history from the log, entry agent or selector for `routing`, `renameSession` recorder, no persistence); build the proposed config from file texts through render and validation
- [ ] 2.3 Tests: recorded match, unrecorded `createWorkOrder` call, no MCP connection opened, no rows written to chat or chat log tables, selector entry for `routing`

## 3. Judge and regression set

- [ ] 3.1 Implement the judge with a zod verdict schema (`improved|same|regressed|inconclusive`, reason); `inconclusive` without a model call when there is no comment and no expected result
- [ ] 3.2 Implement the regression set: every Good message review of the same agent, most recent first, replay concurrency limit 3, per-replay timeout, per-replay error isolation
- [ ] 3.3 Add entity `ImprovementReplay`, the `published` status and `branch`/`prUrl` columns, and a migration
- [ ] 3.4 Wire replay into generation after the Proposal step (skipped when there is no diff), store results, keep the proposal `generating` until done; test the labeled `fault_report` case end to end with fake models, including a `regressed` regression case and a failing replay that does not fail the proposal

## 4. Pull request

- [ ] 4.1 Implement `GitHubWriter` beside `GitHubClient` using `CONFIG_GITHUB_TOKEN` (default branch head, blobs, tree, commit, ref, pull request) with the same headers, error mapping and redaction; map 403/404 on writes to the "needs Contents and Pull requests write access" error; extend the GitHub spec tests with a fake fetch
- [ ] 4.2 Implement publish: status guard, local-source and missing-token checks, default-branch staleness check (409 and stale mark), branch `improvement/<short-id>`, one commit, PR body with rationale, review ids and replay summary (regressions first), atomic `published` update with branch and URL
- [ ] 4.3 Add the publish endpoint (`409` when not available, not `ready` or already published); tests for double publish, stale base, missing token, permission error and token redaction

## 5. Web

- [ ] 5.1 Show replay results on the proposal detail page: old and new output with tool calls, `unrecorded` marks, verdict badges, highlighted regressions, the "each side ran once" notice
- [ ] 5.2 Add the "Create pull request" confirmation dialog (diff, rationale, replay results), hidden when publishing is unavailable, and show the PR link and `published` status afterwards
- [ ] 5.3 Web tests for view helpers (verdict rendering, availability rules, dialog contents)

## 6. Verification

- [ ] 6.1 Run lint, typecheck and all unit tests for `api`, `web` and `shared`
- [ ] 6.2 Manually run the labeled `fault_report` review: replay shows an `unrecorded` `work_order_createWorkOrder` call judged `improved`, and the regression replays of Good reviews have verdicts
- [ ] 6.3 Publish once against a throwaway config repository with the owner-confirmed token and check the branch, single commit and open pull request, and that nothing was merged
- [ ] 6.4 Document replay, the judge and publishing (token permissions) in the README and `docs/config-sample/README.md`
