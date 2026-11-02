## Context

Chat sessions are isolated: `AgentService.run` builds its message list from one session's history (`trimHistory`, `settings.maxContextMessages`) and `composePrompt` (in `multi-agent.middleware.ts`) builds the system prompt from the agent definition plus run state. Sessions are owned by the OIDC subject (`ChatSession.ownerSub`, null when auth is disabled). Tools get ids and repositories through `AgentToolContext` (factories in `agent/tools`), and the Agent Config (`config.schema.ts`) holds global `settings` and per-agent tool lists, so a feature like this has to fit those seams. PostgreSQL already has the `vector` extension, but the model endpoint offers no embedding model.

## Goals / Non-Goals

**Goals:**
- Durable per-user notes that survive across sessions and are visible to every agent in later runs.
- The agent can write and remove memories during a chat; the user can see and edit everything that is remembered.
- No behaviour change for deployments that do not enable it, and deterministic replays.

**Non-Goals:**
- Semantic/vector retrieval, session summarization, cross-user or admin-visible memories, memory expiry jobs.

## Decisions

1. **Plain-text rows in a new `user_memories` table** (`id uuid`, `ownerSub varchar`, `content text`, `source 'agent'|'user'`, `sessionId uuid null` with `ON DELETE SET NULL`, `createdAt`, `updatedAt`; index on `(ownerSub, updatedAt desc)`). Alternative: reuse `app_settings` or a JSON column on `users` — rejected, memories are many small rows that are listed, edited and deleted individually. Alternative: pgvector embeddings — rejected for now (no embedding provider, and a bounded list is enough at this scale); the table can gain an `embedding` column later without API changes.
2. **Owner key is `ownerSub`, same as sessions; no username or email is stored on the memory.** The owner's `email` lives in the existing `users` table (`sub`, `email`), which admins filter on by joining `user_memories.ownerSub = users.sub`. Nothing in the app currently fills `users` from logins (only the seed script does), so the sign-in itself writes it: right after login the web app calls `GET /api/auth/me` (see `AuthProvider`), and that handler checks the `users` row for the token's `sub` and inserts it with the token's `email` when missing, or updates `email` when it differs (no write when it is unchanged; skipped when auth is disabled or the token has no `sub`). A failed upsert is logged and does not fail `/auth/me`. Memory writes do not touch `users`. Memories whose owner has no `users` row or no email (e.g. auth disabled) appear in the admin list with an empty email and match no non-blank filter.
   Owner scoping: When auth is disabled `ownerSub` is null and memories are stored under the empty-owner bucket (queried with `IS NULL`), mirroring how `ChatService` scopes sessions. The owner always comes from the request/run context, never from tool arguments.
3. **Recall by injection, not by tool.** At the start of a run `AgentService` loads the owner's newest `settings.memory.maxMemories` (default 30) memories once and passes them into `createMultiAgentMiddleware`; `composePrompt` appends a block "What you remember about this user" (one bullet per memory, oldest first) when the list is non-empty. This costs no model round trip and cannot be forgotten by the model. Alternative: a `recallMemory` tool — rejected, an extra tool call on every run and agents would skip it. Content is clipped (500 chars per memory) and framed as user-provided data, not instructions, to limit prompt injection through stored text.
4. **Two local tools, `saveMemory(content)` and `forgetMemory(id)`.** Registered in `TOOL_FACTORIES`/`LOCAL_TOOL_NAMES`; opt-in per agent through the existing `tools` list, and the sample config adds them to `fault_report`, `work_order_inquiry` and `other` (not `selector`). `saveMemory` trims/collapses whitespace, rejects empty content, skips an exact duplicate (case-insensitive) of an existing memory, and enforces a per-user cap (`MEMORY_MAX_PER_USER = 200`) without ever failing because of it: when the owner is at the cap it deletes the owner's oldest memory (smallest `createdAt`) in the same transaction as the insert, so the new one always fits. The injected block lists each memory with its short id (first 8 chars of the uuid) so `forgetMemory` can name it; ids are resolved within the owner's rows only. Prompt instructions telling agents *when* to save (durable preferences, stable facts, not one-off details or secrets) live in the agent system prompts of the sample config, not in code.
5. **REST API under `/api/memories`** (any authenticated user, scoped to their own rows): `GET` list, `POST` create, `PATCH :id` edit, `DELETE :id`. **Admins** (`@Roles('admin')`, existing `RolesGuard`) use a parallel `/api/admin/memories` set: `GET ?email=&page=&pageSize=` lists everyone's memories newest first (left join `users` for the email), filtered by case-insensitive substring match on `users.email` (`ILIKE`, `%`/`_` escaped); `PATCH :id` and `DELETE :id` act on any memory; `POST` is not provided (an admin creates memories for themselves through the normal endpoint). An admin edit keeps the owner and `source` and sets `updatedAt`. DTOs validated with class-validator (`content` 1–500 chars). `Memory` DTO type goes to `@app/shared`.
6. **Config switch** `settings.memory = { enabled: true, maxMemories: 30 }` in the Agent Config schema (strict, defaulted). When `enabled` is false nothing is injected and the two tools return a "memory is disabled" failure instead of writing; the API and web page stay available so users can still review and delete.
7. **Replay:** the run writes the injected memory texts into the metadata of its chat-log LLM events (`metadata.memories`, an array of strings). Replay re-injects exactly those and replaces `saveMemory`/`forgetMemory` with recorders (same pattern as `renameSession`), so replays neither read nor write `user_memories`.
8. **Web:** a first-level **Memory** menu item and page (list with source and date, add, inline edit, delete with confirmation), using the existing API client and styling; shown to all signed-in users. For admins the page lists all users' memories, adds an Email column and an email filter input (debounced, sent as `?email=`), with the same edit/delete controls; non-admins see only their own memories and no filter.
9. **Config sample:** the Agent Config changes (`settings.memory` in `config.yml`, `saveMemory`/`forgetMemory` and prompt guidance in the downstream agent files) are made only in `docs/config-sample/langchain-example`. That sample is not kept in lockstep with the Config Repo's latest version; the maintainer merges the change into the Config Repo manually, so no other config tree, sync tooling or version bump is part of this change.

## Risks / Trade-offs

- [Prompt injection via stored text] → memories are clipped, rendered inside a delimited block labelled as user data, and the user can review and delete them on the Memory page.
- [Admin sees all memories] → read/edit access follows the existing admin group; admin changes are not separately audited in this change.
- [Email missing or changed] → the `users` email is refreshed on each memory write; memories of users without an email cannot be found by the filter, `ownerSub` stays the authoritative owner.
- [Sensitive data saved by the agent] → sample prompts tell agents not to store credentials or personal identifiers; the cap and the visible Memory page limit exposure; chat-log tool calls make every save auditable.
- [Prompt growth] → bounded by `maxMemories` and the per-memory clip; the newest memories win when there are more.
- [Stale or wrong memories] → agents can `forgetMemory`; users can edit/delete; no automatic expiry in this change.
- [Silent eviction loses a memory] → only the oldest of 200 goes, and only on an agent save; the eviction is visible in the chat log through the tool call and the user can re-add or review on the Memory page. A manual create on the Memory page (REST) still rejects when full, so users never lose memories by clicking Add.
- [Duplicate/near-duplicate saves] → only exact duplicates are skipped; semantic dedupe is deferred with vector retrieval.

## Migration Plan

Run migration `1700000000008-user-memories` (creates the table and index; `down` drops it). Deploy the API, then the web app. Existing deployments get the feature when their Agent Config adds the tools to agent definitions; without that, only the injection and the Memory page are active (empty). Rollback: revert the deploy and run the `down` migration; no other table changes.

## Open Questions

- Should memories be injected into the `selector` prompt too (could improve routing)? Default here: yes, injected for every agent, but only downstream agents can write.
