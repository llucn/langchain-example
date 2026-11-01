## Context

`improvement-proposals` stores proposals (agent, base commit, file texts, diff, rationale, notes) and cases (review id, evidence, diagnosis) and leaves applying them to the admin. Agents run through `AgentService.run`, which builds a LangChain agent from the active config and the MCP tools of `mcpServers` connected with the visitor's JWT (`connectMcp`). The config repository is read through `GitHubClient` with `CONFIG_GITHUB_TOKEN`; reads redact the token and never forward it to the tarball download host.

Replay must not touch MCP servers: tools such as `work_order_createWorkOrder` change real data. The cases that matter most are those where the new config does something the old one never did (calling `createWorkOrder`), which the log has no recorded result for.

## Goals / Non-Goals

**Goals:**
- Replay the reviewed turn under old and proposed config with identical inputs and no side effects.
- Judge target cases against the reviewer's expectation and check Good reviews of the same agent for regressions.
- Open a pull request from a proposal after explicit confirmation, safely and idempotently.

**Non-Goals:**
- Automatic merge, release or version comparison after release.
- Multi-turn user simulation or replay of whole sessions.
- Executing, mocking with fabricated data, or otherwise reaching MCP servers during replay.
- A second GitHub credential.

## Decisions

### 1. Replay swaps the tool layer, not the agent

`AgentService.run` gets one optional per-run input, `mcp?: McpConnection` (`tools`, `toolsByServer`, `close`); when given it is used instead of `connectMcp`. That is the only change to the chat path, and it must leave the existing `agent.service` and multi-agent specs green. Replay builds a **separate `AgentService`** whose `AgentConfigService` is the old or the proposed config (the proposed one assembled from the proposal's file texts through the existing render and validation path, not from the repository) and whose `sessions` repository is a stub: `update` records the call and writes nothing, which turns `renameSession` into a recorder without touching the tool. `selectAgent` runs as is (pure). The replay never persists a chat session or chat log.

The `RecordedMcp` connection is built from the proposal's tool inventory (names, descriptions and JSON input schemas, grouped by server), because the new config may call a tool the log never did (`createWorkOrder`) and the agent must have that tool to call it. For each call:

- exact match on tool name and canonical JSON of arguments against the session's recorded tool results, read **unclipped** from `chat_log_messages` (the clipped copies in the case evidence are not used), each result consumed once in recorded order → return the recorded result;
- otherwise → return a marked placeholder (`[replay] no recorded result for this call; it was not executed`) and record the call as `unrecorded`.

The second case matters: the change we want has no recorded result by construction. The call itself, with its arguments, is the evidence the judge evaluates against the expected result.

Replay input is the reviewed turn: history before it comes from the log (unclipped, trimmed to `maxContextMessages`, not regenerated) and the user message of the turn is re-sent. The entry agent is the reviewed event's agent, except for `routing` diagnoses where the selector is the entry. Both runs share history, tool stubs and context limit.

**Dependency on the tool inventory:** replay needs the inventory to build the tools. When it could not be read (for example authentication is off in development, so there is no token for the MCP servers), replay is skipped for that proposal with a note; the proposal still becomes `ready`.

### 2. Judge compares, humans decide

A judge call (the evolution model) receives the case (comment, expected result), the old output and the new output (final text and ordered tool calls with `unrecorded` flags) and returns `verdict` (`improved` | `same` | `regressed` | `inconclusive`) with a short reason. A case with neither comment nor expected result is `inconclusive` without a model call. For regression cases the question is "does the new output still satisfy what was good", with the review's text and the old output as reference. Verdicts are advisory: they never block publishing but appear on the page and in the PR body. Each side runs once; the page says so.

### 3. Regression set is every Good review of the agent

All Good message reviews of the proposal's agent are replayed (no cap, by decision). To keep generation bounded in time, replays run with a small concurrency limit (3) and each replay has its own timeout; a failed replay is stored as an error for that case and does not fail the proposal. Ordering is most recent first so partial progress is meaningful.

### 4. Replay runs inside generation and is stored

After the Proposal step produces a diff the service replays target cases then the regression set; the proposal stays `generating` until done. New table `improvement_replays` (proposal id, optional case id or review id, `kind` `target|regression`, old and new output jsonb with text, tool calls and `unrecorded` flags, `verdict` jsonb, `error`). Proposals gain `branch` and `prUrl` and the status `published`. One migration.

### 5. Publishing uses the existing token and the Git Data API

`POST /…/:id/publish` requires status `ready` with a diff and an explicit admin action (the page's confirmation dialog shows diff, rationale and replay results). A `GitHubWriter` beside `GitHubClient` (same header, error mapping and redaction) then: reads the repository's default branch and its head, verifies that each target file at that head still has the content the proposal was computed from (otherwise marks the proposal stale and responds 409), creates `improvement/<short-id>`, writes one commit (blobs, tree, commit, ref) and opens the pull request with the rationale, review ids and replay summary in the description. The `published` update with `branch` and `prUrl` is guarded by a status check in one statement so a double click cannot open two PRs. The default branch is read from the repository, never assumed; nothing is pushed to it and nothing is merged.

`CONFIG_GITHUB_TOKEN` is the only credential. Whether it can write is not knowable up front, so the page offers "Create pull request" when the source is a GitHub repository and a token is set, and a 403/404 on a write request is reported as "the token needs Contents and Pull requests write access" (with the token redacted) while the proposal stays `ready`. A local directory source cannot publish.

*Alternatives:* Contents API per file (one commit per file, noisier history); a separate write token (declined by the owner: one token, whose permissions the owner confirms).

## Risks / Trade-offs

- [Replay with stubs is not production behavior (unrecorded calls get a placeholder)] → The judge evaluates intent and arguments of unrecorded calls, not downstream effects; the page labels results as advisory.
- [LLM non-determinism makes verdicts noisy] → Single run per side is stated; both sides share inputs; verdicts only inform.
- [Unbounded regression set grows cost and time as Good reviews accumulate] → Concurrency limit, per-replay timeout and errors isolated per case; most recent first; revisit if the count grows (a cap can be added later without changing the data model).
- [One token with write permission reads and writes the config repository] → Only branches and PRs are created, never the default branch or a merge; branch protection on the default branch remains the real gate; the token is never logged or stored with proposals; the owner confirms its permissions.
- [The optional `mcp` input to `AgentService.run` can regress chat] → Minimal, behavior-preserving, covered by the existing specs before replay is built on it.
- [Replay is unavailable without a tool inventory] → Skipped with a note; run generation on an environment with authentication to get replay results.
- [Stale proposals overwrite newer config edits] → The default-branch content check answers 409 and marks the proposal stale.

## Migration Plan

1. Implement and archive `improvement-proposals` first.
2. Deploy the migration (new table and columns only).
3. Give `CONFIG_GITHUB_TOKEN` Contents and Pull requests write access on the config repository to enable publishing; without it everything else works and publishing reports the permission error.
4. Roll back by removing the replay and publish code and the new table and columns; proposals, log and config are unaffected. Opened PRs are independent of the API.

## Open Questions

- None blocking.
