## 1. Spike and shared types

- [x] 1.1 Verify against the installed `@langchain/*`/`langchain` versions what `handleChatModelStart/End` and `handleToolStart/End` expose (run id, token usage, model name, tool call id) and how a `Command` result from `selectAgent` appears; record the correlation approach in design.md if it differs
- [x] 1.2 Add to `@app/shared`: `ChatLogMessageType`, `ChatLogSession`, `ChatLogMessage`, `ChatLogReview`, list/query/review-request types, `ReviewRating`, and the `REVIEW_TAGS` list

## 2. Config, roles and app version

- [x] 2.1 `config/env.ts`: add `app.version` (`APP_VERSION`, else `apps/api/package.json` version, else `unknown`) and `auth.adminGroup` (`ADMIN_GROUP`, default `admin`); update `.env.example` and the env unit test if present
- [x] 2.2 `@Roles('admin')` decorator and `RolesGuard` (reads `cognito:groups`; 403 for non-admin; open when auth is disabled); register globally after `JwtAuthGuard` or per controller; unit tests for admin / non-admin / auth disabled / custom group

## 3. Database

- [x] 3.1 Entities `ChatLogSession`, `ChatLogMessage`, `ChatLogReview`, `AgentConfigSnapshot` per design decisions 2–4 (no FK to `chat_sessions`; `seq` unique per session; partial unique indexes on reviews; indexes on `turnId`, `(agentName, agentConfigHash)`, `createdAt`)
- [x] 3.2 Migration `1700000000003-chat-log` creating the four tables and indexes with a working `down`; register the entities in `data-source-options.ts`
- [ ] 3.3 Run the migration against a local database and check the schema

## 3b. Agent config identity

- [x] 3.4 In `agent.config.ts` (or a sibling file) add `agentConfigHash(name)` (SHA-256 of canonical JSON of the definition without `version`) and `agentConfigSnapshot(name)`; unit test that hash is stable, ignores `version`, and changes when the prompt changes

## 4. Logging service

- [x] 4.1 `ChatLogModule` / `ChatLogService`: `recordSession`, `ensureSession`, `touchName`, `markDeleted`, `recordEvent` (atomic `seq` via `UPDATE … RETURNING messageCount`, snapshot upsert with in-memory cache, 64 KB caps + `truncated`), all wrapped so errors are only logged
- [x] 4.2 Unit tests: seq allocation, caps/truncation, error swallowing, lazy session creation, snapshot stored once
- [x] 4.3 `AgentRunContext.log` sink type; `AgentService.run` passes a callback handler in the stream config and reports LLM events (content, reasoning, tool calls, model, usage, duration, agent before state update, routing metadata) and tool results (name, tool call id, status, duration, source) to the sink
- [x] 4.4 Unit tests with a fake model/tools: event order and types for plain answer, tool use, routing (`selectAgent` attributed to `selector`), tool error, failed run
- [ ] 4.5 `ChatController`: create the log session on `POST /chat/sessions`, record `user_input` before the run, pass the sink, record `llm_end_turn` link (`chatMessageId`) and `run_error`, update the log name on renames, mark the log session deleted on `DELETE`; verify the SSE contract and stored chat messages are unchanged and that a log failure does not affect them

## 5. Admin log API

- [x] 5.1 `AdminChatLogController` (`/admin/chat-logs`, admin only): `GET /sessions` with paging, filters (`user`, `agent`, `appVersion`, `from`, `to`, `rating`) and aggregates (event count, last event time, agents, good/bad counts)
- [x] 5.2 `GET /sessions/:id` returning the session, events ordered by `seq`, and all reviews
- [x] 5.3 `PUT`/`DELETE` `/sessions/:id/review` and `/messages/:id/review`: upsert the caller's review (reviewer from the token, `anonymous` when auth is off), validate rating/tags, reject `expectedResult`/`difference` on session reviews with 400, 404 for unknown targets
- [x] 5.4 Tests: filters, review upsert and per-reviewer uniqueness, 400/403/404 paths, deleted sessions still listed

## 6. Web: Log Review

- [x] 6.1 `AuthProvider`: derive `isAdmin` from the ID token's `cognito:groups`; (auth disabled → true)
- [x] 6.2 `lib/chatLog.ts` API client for the admin endpoints
- [x] 6.3 `LogReviewPage` at `/log-review`: filter bar, paged session list with rating badges, deleted marker
- [x] 6.4 Session timeline grouped by turn: type badge, agent + config version, time, duration, content, collapsible tool args/results, error styling, existing reviews
- [x] 6.5 Good/Bad buttons on the session header and each message event; review form (comment, tags; expected result and difference on messages); upsert/remove; selected state shown
- [x] 6.6 Add the nav item (admin only) and route in `App.tsx`, with a not-authorised view for non-admins that makes no log requests
- [x] 6.7 Frontend tests for the pure helpers (grouping into turns, rating state) and a manual pass in light and dark theme

## 7. Wrap-up

- [x] 7.1 Run lint, typecheck, unit tests and build for `@app/shared`, `@app/api`, `@app/web`
- [ ] 7.2 End-to-end manual check: chat that routes and uses a tool, open it in Log Review, rate session and a message with expected result, delete the chat session and confirm the log remains
- [x] 7.3 Update `README.md` (env vars, admin group, Log Review) and confirm no secrets appear in any logged event
