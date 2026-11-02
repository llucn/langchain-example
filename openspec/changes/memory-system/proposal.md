## Why

The agents only see the current chat session (the last `maxContextMessages` messages), so every new session starts from zero: a visitor must repeat their building, their usual contact, their language and earlier decisions. A per-user long-term memory lets the agents remember durable facts and preferences across sessions.

## What Changes

- Add a **per-user memory store** (`user_memories` table): short text notes owned by the visitor's OIDC subject, each with a source (the agent saved it, or the user added it) and the session it came from.
- Give the downstream agents two local tools, `saveMemory` and `forgetMemory`, so they can store a durable fact the visitor shares and remove one the visitor asks them to forget. The owner is injected from the run context, never chosen by the LLM.
- **Inject memories into every run**: the visitor's most recent memories (bounded by a new Agent Config setting `maxMemories`) are added to the system prompt of the current agent as a "What you remember about this user" block, so no tool call is needed to recall.
- Add a **Memory** page in the web app where a visitor lists, adds, edits and deletes their own memories (the visitor stays in control of what is remembered). Users in the `admin` group (see `admin-access`) can additionally view and modify **every** user's memories on that page and filter them with an `email` input (matched against the owner's `email` in the `users` table; `user_memories` stores no username or email).
- Add a `memory` toggle in the Agent Config settings (`settings.memory.enabled`, default on) so a deployment can turn the feature off without removing tools from agent definitions.
- Memories are recorded in the chat log (tool calls are already logged) and are included in the replay recording so replays stay deterministic.

Agent Config changes (the new `settings.memory` block and the tools/prompts of the sample agents) are made only in the sample under `docs/config-sample/langchain-example`; it does not need to track the latest Config Repo version, the maintainer merges it into the Config Repo by hand.

Out of scope: semantic (vector) retrieval, automatic summarization of whole sessions, sharing memories between users (admins manage them, agents never see another user's). A full memory is not an error for the agent: `saveMemory` silently deletes the owner's oldest memory to make room.

## Capabilities

### New Capabilities
- `user-memory`: storage, ownership, limits, REST API and web page for per-user memories, plus the `saveMemory` / `forgetMemory` tools and the prompt injection.

### Modified Capabilities
- `admin-access`: admin-only memory endpoints and the admin view of the Memory page.
- `ai-agent`: the system prompt of a run includes the visitor's memories, and the local tool set gains `saveMemory` and `forgetMemory`.
- `agent-config`: new `settings.memory` block (`enabled`, `maxMemories`) validated with the rest of the config; agent definitions may list the new local tool names.
- `config-replay`: a replay uses the memories recorded with the original run instead of the current ones, and does not write memories.

## Impact

- **API**: new `apps/api/src/memory/` module (entity, service, controller, DTOs); `agent.service.ts` (prompt injection), `agent/tools/` (two factories, `LOCAL_TOOL_NAMES`), `agent-config/config.schema.ts`, `auth/auth.controller.ts` (login-time `users` upsert), replay service; sample config files under `docs/config-sample/langchain-example`.
- **Database**: migration `1700000000008-user-memories` (table with an `ownerSub` column and an index on `(ownerSub, updatedAt)`; no username/email column).
- **Shared**: `Memory` DTO type in `packages/shared`.
- **Web**: new Memory page and first-level menu item; API client functions.
- **Docs/specs**: README configuration notes; new `user-memory` spec and four delta specs.
- No new dependencies.
