## Why

The chat agents are tuned by hand and nobody can tell how well they work: what users asked, which tools an agent called, what came back and how long it took is only visible in the transient `thinking` stream. To improve the agents systematically (later: LLM-assisted evaluation, analysis of good/bad conversations and upgrades of the Agent Config) we first need a complete, durable record of every chat event and a way for people to judge it. This change builds that foundation: structured logging plus a manual review tool, with a data model that already carries what the later steps will need.

## What Changes

- **Chat logging**: every chat session and every message event of a run is written to dedicated log tables, separate from `chat_sessions`/`chat_messages`, so logs survive deleting a session.
  - Session event: time, user, session id, app version.
  - Message events, one row each, with time, user, agent name, agent config version (plus a content hash and a stored snapshot of the definition), content and type: `user_input`, `llm_tool_use`, `llm_end_turn`, `agent_tool_result` (and `run_error` for a failed run). LLM and tool rows carry the response time; LLM rows also carry model, token usage and reasoning.
  - Logging is best-effort: a failing log write never breaks or slows the chat answer.
- **Log Review (admin only)**: a new web page and API where users with the `admin` role browse logged sessions, open the full event timeline of one, rate a session or a message as Good/Bad, add a comment and issue tags, and — on a message — record the expected result and how the actual one differs.
- **Admin role**: introduce a role check (Cognito group `admin`, configurable) enforced by the API (403) and reflected in the web navigation.
- **Forward-looking data design** (no behaviour built now): reviews are a separate table with a reviewer type (`human` now, `llm` later) and evaluator field; each message is attributable to an exact agent config via version + hash; agent config snapshots are stored by an identifier (a SHA-256 content hash now). The versioned Agent Config is planned as text files in a GitHub repository (version = tag or branch), at which point the identifier becomes the Git commit ID; the schema already accommodates it.
- **Not in scope**: LLM auto-evaluation, analysis/suggestion of improvements, versioned/editable Agent Config (it stays in code), end-user feedback buttons, log retention/anonymisation jobs, exporting review data as an evaluation dataset.

## Capabilities

### New Capabilities
- `chat-logging`: what is recorded for sessions and message events, how types, agent/config attribution and response times are captured, ordering and grouping of events, retention after session deletion, and failure isolation.
- `chat-log-review`: the admin Log Review API and page — listing/filtering logged sessions, event timeline, Good/Bad reviews with comments and tags on sessions and messages, expected result on messages.
- `admin-access`: determining the `admin` role from the token and restricting admin APIs and pages to it.

### Modified Capabilities
<!-- None: the existing chat, session and agent behaviour is unchanged; logging is a side effect. -->

## Impact

- Code (api): new `chat-log` module (`ChatLogService`, admin controller, entities, DTOs) and an `auth` roles guard; `AgentService.run` gains an optional log sink and a LangChain callback handler for timings; `ChatController` records session/user/answer/error events; `agent.config.ts` exposes the config hash/snapshot helper; `config/env.ts` reads `APP_VERSION` and `ADMIN_GROUP`.
- Database: four new tables (`chat_log_sessions`, `chat_log_messages`, `chat_log_reviews`, `agent_config_snapshots`) in one migration; no change to existing tables.
- Code (web): new `LogReviewPage` and nav item visible to admins; `AuthProvider` exposes `isAdmin`.
- Shared: new log/review types and the tag list in `@app/shared`.
- Environment: `APP_VERSION` (defaults to the api `package.json` version), `ADMIN_GROUP` (default `admin`); document both in `.env.example`.
- Privacy: logs hold user text and business data returned by tools and are readable by admins only; retention is an open question (see design).
- Performance: one to a few small inserts per chat event, off the response path.
