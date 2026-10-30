## Context

Today a chat run (`ChatController.send` → `AgentService.run`) streams reasoning, tool calls and tool results to the client as `thinking` text and stores only two things: the user message and the final assistant message (`chat_messages`, with the folded `thinking` string). What the agent really did is lost as structure: which agent and config answered, each model call and each tool call with its arguments, result and duration, token usage, errors. Deleting a session removes even the little that exists (FK `ON DELETE CASCADE`).

The long-term goal is an agent improvement loop: log everything → judge it (manually now, by an LLM later) → analyse good vs bad logs → propose and roll out Agent Config upgrades. Agent definitions are hard-coded in `agent.config.ts` (each has a `version: 'v1'` hook, nothing more). Auth is Cognito OIDC; the JWT guard puts the payload in `req.user` (`sub`, `email`, `cognito:username`, `cognito:groups`); with `AUTH_ENABLED=false` (local dev) there is no user. The web app uses the `@techconnect/design-system` components and react-router.

This change delivers step one (logging + manual review) and shapes the data so later steps need additions, not rewrites.

## Goals / Non-Goals

**Goals:**
- Record every session and every message event of a run in structured, queryable tables, each event attributable to user, agent, exact agent config and app version, with response times.
- Logs are independent of the chat tables and survive session deletion.
- Admin-only review UI: browse sessions, see the event timeline, rate sessions and messages Good/Bad with comments, tags, expected result and difference.
- A review model that already fits non-human reviewers and several reviewers per target.
- Logging can never fail or noticeably slow a chat request.

**Non-Goals:**
- LLM auto-evaluation, good/bad analysis, improvement suggestions, Agent Config upgrades (later).
- Versioned/editable Agent Config storage and rollout (later; only the identification of a config in logs is designed now).
- End-user thumbs up/down, dataset export, retention/anonymisation jobs, log search by full text, alerting.
- Changing the chat HTTP/SSE contract or the existing `chat_*` tables.

## Decisions

### 1. Dedicated log tables, no foreign key to the chat tables

New tables `chat_log_sessions` and `chat_log_messages` hold the log; they reference chat sessions by **plain uuid** (`chat_log_sessions.id` *is* the chat session id), not by FK. Deleting a chat session therefore leaves its log intact (`deletedAt` is set on the log session).

*Alternatives:* extend `chat_messages` with log columns (rejected: cascade-deleted with the session, mixes product data with audit data, one row per event does not fit the user/assistant message model); append-only log file/stream (rejected: not queryable for the review UI and later analysis).

### 2. Event model: one row per event, grouped into turns

`chat_log_messages` (one row per event; the name follows the requirement's "Chat Message"):

| column | notes |
|---|---|
| `id` uuid PK | |
| `sessionId` uuid FK → `chat_log_sessions` (cascade within the log), index | |
| `seq` int, unique with `sessionId` | total order inside a session |
| `turnId` uuid, index | all events caused by one user message (user input … end turn) |
| `type` | `user_input` \| `llm_tool_use` \| `llm_end_turn` \| `agent_tool_result` \| `run_error` |
| `userSub` varchar null | actor of the turn; null when auth is off |
| `agentName` varchar(64) | agent that produced/received the event (see 5) |
| `agentConfigVersion` varchar(32), `agentConfigHash` varchar(64) FK → `agent_config_snapshots` | see 4 |
| `appVersion` varchar | version running *this* event (can differ from the session's after a deploy) |
| `model` varchar null | LLM events |
| `content` text, `truncated` bool | text of the event; `llm_tool_use` keeps any text the model wrote with the call |
| `thinking` text null | reasoning blocks of LLM events |
| `toolCalls` jsonb null | `llm_tool_use`: `[{id, name, args}]` |
| `toolName`, `toolCallId` varchar null | `agent_tool_result`; `toolCallId` pairs a result with its call |
| `status` `ok` \| `error`, `errorMessage` text null | tool errors and run errors |
| `startedAt` timestamptz null, `createdAt` timestamptz, `durationMs` int null | `createdAt` = event time (when it ended); `durationMs` set on LLM events (model call) and tool results (tool execution), null for user input |
| `chatMessageId` uuid null | the `chat_messages` row, for `user_input` and `llm_end_turn`; no FK |
| `metadata` jsonb | `usage` (input/output/cached tokens), `stopReason`, selector turn and routing summary, tool source (`local` or MCP server name) |

Mapping to the four required types: the user's message → `user_input`; an AI message with tool calls → `llm_tool_use`; the AI message without tool calls (the final answer) → `llm_end_turn`; a tool message → `agent_tool_result`. `run_error` (the run threw, e.g. model unreachable) is added so a failed run is not invisible; it is the only event type beyond the requested four.

`chat_log_sessions`: `id` (= chat session id, PK), `userSub` null, `userName` (snapshot of email/username so the UI needs no user lookup), `appVersion`, `startedAt` (the chat session's start), `name` (snapshot, refreshed when the session is renamed), `deletedAt` null, `messageCount` int (also the `seq` allocator, see 6).

*Alternative:* one wide generic `events` table with a JSON payload (rejected: harder to filter by type/agent/duration and to annotate).

### 3. Reviews are a separate table, never edits to the log

`chat_log_reviews`: `id`, `sessionId` FK, `messageId` FK null (null = review of the whole session), `rating` (`good` \| `bad`), `tags` text[], `comment` text null, `expectedResult` text null, `difference` text null, `reviewerType` (`human` \| `llm`), `reviewerSub`, `reviewerName`, `evaluator` varchar null (for `llm`: model + prompt version, future), `createdAt`, `updatedAt`.

- Logs stay immutable; reviews can be added by several reviewers and, later, by an LLM evaluator without touching log rows. Aggregates (good/bad counts per session, per agent config) are queries.
- One human review per reviewer per target, enforced by two partial unique indexes (session-level on `(sessionId, reviewerSub)` where `messageId IS NULL`; message-level on `(messageId, reviewerSub)`), so Good/Bad clicks upsert. When auth is off `reviewerSub` is the literal `anonymous`.
- `expectedResult` and `difference` are only accepted on message reviews. Both are free text: for an `llm_tool_use` they describe the expected call (e.g. wrong agent routed, missing argument), for an `llm_end_turn` the expected answer. They are the seed of later regression/evaluation cases.
- `tags` is a fixed vocabulary in `@app/shared` (e.g. `wrong_routing`, `wrong_tool`, `bad_tool_args`, `hallucination`, `incomplete`, `wrong_language`, `tone`, `too_verbose`, `other`) so failures can be counted by cause later; free text stays in `comment`.

*Alternative:* review columns on the log rows (rejected: single reviewer, mutable log, no place for LLM reviews).

### 4. Identifying the exact Agent Config: version + content hash + stored snapshot

The definition's `version` string is a hand-maintained label and can be forgotten when someone edits a prompt. So every logged agent event carries both `agentConfigVersion` (the label) and `agentConfigHash` (SHA-256 over the canonical JSON of the definition without `version`: model, params, tools, system prompt). A table `agent_config_snapshots` (`hash` PK, `agentName`, `version`, `definition` jsonb, `firstSeenAt`) stores each distinct definition once, inserted with `ON CONFLICT DO NOTHING` the first time a process uses it (cached in memory afterwards). Good/Bad analysis can therefore group by `(agentName, hash)` even without disciplined versioning, and the stored prompt is readable next to the review. 
**Forward path (not built now):** the versioned Agent Config will be stored as text files in a GitHub repository, not in database tables; a version is a Git tag or branch. The identity of a config then becomes the **Git commit ID** that the running agent loaded. This change deliberately uses the SHA-256 content hash; later the value written to `agentConfigHash` is replaced by the commit ID, and `agentConfigVersion` carries the tag or branch name. The log schema stays the same except that the hash column is `varchar(64)` (not `char(64)`) so it holds either a 64-character SHA-256 or a 40-character SHA-1 commit ID. `agent_config_snapshots` remains a local copy of the definition keyed by that identifier (for SHA-256 it is the only copy; for commit IDs it can be filled from the repository), so reviews stay readable even if the repository changes. Because old and new identifiers differ in kind, they never collide and logs written now remain valid.

Runtime parts of the prompt (selector turn counter, routing summary; see `composePrompt`) are not in the definition; they are put in `metadata` of the LLM event so the effective prompt can be reconstructed. The conversation sent to the model is reconstructible from preceding events of the session plus the fixed context limit.

### 5. Where events come from (instrumentation)

`AgentService.run` stays free of persistence: `AgentRunContext` gains an optional `log` sink (`onLlm(event)`, `onToolResult(event)`); `ChatLogService` implements it and the controller passes it in.

- **Content** comes from the existing `streamMode: 'updates'` loop (`foldStep` already sees each AI and tool message), so what is logged equals what the agent produced.
- **Timings, usage, model** come from a LangChain callback handler passed in the stream config: `handleChatModelStart/End/Error` (model call duration, token usage, model name) and `handleToolStart/End/Error` (tool duration), correlated to the stream messages by run order for model calls (sequential) and by `toolCallId` for tools (they may run in parallel). If the callback API does not expose `toolCallId`, correlate by tool name and order within the step.
- **Agent attribution**: events use the agent that was current *before* the step's state update is applied, so the `selectAgent` call and its result belong to `selector`, and the first downstream reply to the downstream agent.
- The controller records `user_input` before the run starts and `run_error` when the run throws; `llm_end_turn` is recorded by the sink when the final message arrives, with the `chatMessageId` of the stored assistant message.

*Alternative:* derive everything from the final LangGraph state after the run (rejected: loses events and timings of failed/aborted runs, no per-call duration).

### 6. Ordering, concurrency and failure isolation

- `seq` is allocated atomically with `UPDATE chat_log_sessions SET messageCount = messageCount + 1 WHERE id = $1 RETURNING messageCount`, which also keeps the count; two tabs on one session cannot collide.
- A session row is created when the chat session is created (`startedAt` = chat session start) and lazily upserted when a message arrives for a session without a log row (sessions created before this change are logged from then on).
- Every log write is wrapped: errors are caught and logged with the Nest `Logger`, never rethrown. Writes are awaited sequentially per run but outside the SSE emit path, so a slow database does not delay streamed output beyond the insert itself; the sink does not block `onThinking`.
- Large `content`/`thinking`/tool output is capped (64 KB each) with `truncated = true`; no secrets are logged — the forwarded ID token is not part of any event (it is injected as a header, not a tool argument).

### 7. App version

`AppEnv.app.version` = `APP_VERSION` if set, else the `version` of `apps/api/package.json` (copied into the runtime image), else `unknown`. Written to the session at creation and to each event.

### 8. Admin role and API surface

- Role source: the token's `cognito:groups` contains `ADMIN_GROUP` (default `admin`). A `@Roles('admin')` decorator and `RolesGuard` (after `JwtAuthGuard`) answer 403 otherwise. With `AUTH_ENABLED=false` the guard allows everyone, consistent with the JWT guard being off in local development.
- `GET /auth/me` additionally returns `isAdmin` (computed with the configured `ADMIN_GROUP`; always true when auth is disabled); the web `AuthProvider` reads it, so the web app does not need to know the group name. The nav item/route are hidden for non-admins. The API check is authoritative.
- Endpoints under `/admin/chat-logs` (admin only):
  - `GET /sessions` — paged list; filters: `user`, `agent`, `appVersion`, `from`/`to`, `rating` (`unreviewed` \| `good` \| `bad`), sort by `startedAt` desc; each row carries message count, last event time, agents involved and good/bad counts.
  - `GET /sessions/:id` — session, all events ordered by `seq` (with durations), and all reviews.
  - `PUT /sessions/:id/review`, `PUT /messages/:id/review` — upsert the caller's review; `DELETE` on the same paths removes it.
- Wire types and the tag list live in `@app/shared`.

### 9. Log Review page

Route `/log-review` (admin only). Left: filter bar and paged session list with rating badges. Right: the selected session as a timeline grouped by turn; each event shows type badge, agent name + config version, time, duration and content (tool-call args and tool results collapsible). Session header and each event have **Good** / **Bad** buttons; clicking opens a form (comment, tags; on messages also expected result and difference) and saves immediately, showing the reviewer's current rating highlighted. Other reviewers' reviews are shown read-only. Uses existing design-system components (`FilterBar`, `Pagination`, `Badge`, `Modal`, `Card`, `EmptyState`, `Skeleton`).

## Risks / Trade-offs

- **Sensitive data in logs** (user text, work-order/user data returned by MCP tools) → admin-only access, no secrets logged, size caps; retention/anonymisation is not built now (open question).
- **Logs kept after the user deletes a session** → intentional for evaluation; must be stated to stakeholders; `deletedAt` makes the status visible and a later purge job can honour it.
- **Callback API differences across `@langchain/*` versions** (tool call id, usage fields) → verify against the installed versions early (first task); fallback correlation by order; timing/usage fields are nullable so a gap degrades data, not the chat.
- **Config hash churn**: any prompt edit creates a new snapshot → expected; version label remains the human-friendly grouping.
- **Identifier changes later** (SHA-256 → Git commit ID, see decision 4) → the column is a plain string and snapshots are keyed by it, so no migration of old rows is needed; analysis must treat the two kinds as different configs.
- **Write volume**: a run with N tool calls writes about 2N+2 rows → small inserts; indexes limited to the listed ones; revisit with partitioning only if volume demands.
- **Best-effort logging can drop events silently** (DB down) → failures are logged to the application log; acceptable for analysis data, not for audit/compliance.

## Migration Plan

1. One migration creates the four tables and indexes (no change to existing tables); runs with the usual `migration:run` / `DB_MIGRATIONS_RUN`.
2. Deploy api + web together; set `ADMIN_GROUP` if the Cognito group is not `admin` and make sure admins are in it.
3. Existing sessions get a log row lazily on their next message; no backfill (their old tool/LLM detail was never stored).
4. Rollback: revert the code; the new tables are inert and can be dropped by `migration:revert`.

## Open Questions

- Retention period and anonymisation of user content in logs (and whether a user deleting a session should eventually purge its log).
- Should Good/Bad on a session be required before message-level reviews, or are they independent? (Design assumes independent.)
- Whether non-admin end users will later rate answers themselves (`reviewerType` could gain a `user` value; not built).
