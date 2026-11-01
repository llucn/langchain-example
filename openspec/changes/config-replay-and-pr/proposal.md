## Why

The change `improvement-proposals` produces config improvement proposals from Bad reviews, but an admin can only read them and has to guess whether a proposed prompt really fixes the reviewed behavior or breaks behavior reviewers marked Good, and then has to apply it to the config repository by hand. This change adds evidence and a hand-over: each proposal is replayed against the reviewed conversations using only the MCP results recorded in the log (so nothing is executed against real systems), and, after an admin confirms, a pull request is opened in the config repository for normal code review and release.

## What Changes

- **Replay** re-runs the reviewed turn under the old and the proposed config. MCP tools are never called: they return the results recorded in the log; a call without a recorded result gets a marked placeholder and is reported as `unrecorded`. `renameSession` is replaced by a no-op recorder; nothing is persisted.
- A **Judge** model compares both outputs with the reviewer's comment and expected result and returns `improved`, `same`, `regressed` or `inconclusive` with a reason. For `unrecorded` calls it judges the call and its arguments, not the effect.
- A **regression set** replays every Good message review of the same agent (no limit) and judges that the new config still satisfies what was good.
- Replay runs automatically as the last step of generation; results are stored and shown on the proposal page, as advisory evidence that never blocks publishing.
- **Pull request**: after an admin confirms in a dialog (diff, rationale, replay results), the system creates the branch `improvement/<short-id>`, one commit and an open pull request in the config repository, with rationale, review ids and replay summary (regressions first). It never merges and never pushes to the default branch; it checks that the files still match the proposal's base and answers 409 otherwise.
- The config repository is read and written with the same `CONFIG_GITHUB_TOKEN`; no second token is introduced. Publishing needs the token to have Contents and Pull requests write access and a GitHub (not local directory) config source.
- `AgentService.run` is refactored (behavior-preserving) so the tool source can be injected.

## Capabilities

### New Capabilities
- `config-replay`: replaying logged turns against an old and a new config with recorded MCP results and an LLM judge, without side effects, plus the regression set.

### Modified Capabilities
- `improvement-proposals`: replay during generation; storage of `published` status, branch and pull request URL; proposal page shows replay results and offers "Create pull request"; new requirement for the pull request after human confirmation.
- `agent-config`: the existing `CONFIG_GITHUB_TOKEN` is also used for writing branches, commits and pull requests; write rules (never the default branch, never merge, token not stored or logged).

## Impact

- Depends on `improvement-proposals` being implemented (and archived, so that the specs it modifies exist).
- API: replay service, judge, GitHub writer in `agent-config`, publish endpoint, new `improvement_replays` table and `published`, `branch`, `prUrl` on proposals (migration); refactor of `agent.service` tool injection.
- Web: replay results and verdict badges on the proposal page, "Create pull request" confirmation dialog, PR link.
- Environment: none new; `CONFIG_GITHUB_TOKEN` must be given write permission for publishing, which the owner confirms.
- Cost: two model runs and one judge call per case, and per Good review of the agent in the regression set; the regression set is unbounded by decision.
- Out of scope: automatic merge or release, post-release version comparison, multi-turn simulation, LLM reviewers, automatic triggers.
