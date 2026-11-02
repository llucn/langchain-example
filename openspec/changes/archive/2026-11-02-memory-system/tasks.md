## 1. Data model

- [x] 1.1 Add `UserMemory` entity (`user_memories`, `ownerSub` only: no username/email column) and register it in the database module / data-source options
- [x] 1.2 Add migration `1700000000008-user-memories` (table with `ownerSub`, `(ownerSub, updatedAt)` index, `sessionId` FK `ON DELETE SET NULL`, `down` drops it)
- [x] 1.3 Add the `Memory` DTO type to `packages/shared` and rebuild it

## 2. Memory service and API

- [x] 2.1 Create `apps/api/src/memory/` module with `MemoryService` (list newest first, create, update, delete, find by full/short id, owner scoping incl. null owner, content normalization, 500-char limit, 200 per-user cap (manual create rejects when full; `saveMemory` path evicts the oldest in one transaction), case-insensitive duplicate check) and unit tests
- [x] 2.2 Add `MemoryController` (`GET/POST /memories`, `PATCH/DELETE /memories/:id`) with validated DTOs, 404 for foreign ids, and register the module in `app.module.ts`
- [x] 2.3 Add controller/service tests for owner isolation, limits and cap
- [x] 2.4 In `AuthController.me` (called by the web app right after login) check the `users` row for the token's `sub` and insert it with the token's `email` when missing or update `email` when it differs; no write when unchanged, skipped when auth is disabled or `sub` is missing, failures logged without failing the request; add tests
- [x] 2.5 Add `AdminMemoryController` (`@Roles('admin')`): `GET /admin/memories?email=&page=&pageSize=` (left join `users`, case-insensitive substring match on `users.email`, `%`/`_` escaped, paged, newest first, each row with its owner email), `PATCH/DELETE /admin/memories/:id`; tests for filter, admin vs non-admin (403) and that edits keep owner/source

## 3. Agent config

- [x] 3.1 Add `settings.memory` (`enabled`, `maxMemories`) to `config.schema.ts` and expose it through `AgentConfigService.settings`
- [x] 3.2 Edit only `docs/config-sample/langchain-example`: add `settings.memory` to `config.yml`, add `saveMemory`/`forgetMemory` to the tools of `agents/fault_report.yml`, `work_order_inquiry.yml` and `other.yml`, and add prompt guidance on when to save (durable preferences/facts only, no secrets) and when to forget; no need to match the Config Repo's latest version (merged there manually)
- [x] 3.3 Add validation tests for the new settings and defaults

## 4. Agent tools and prompt injection

- [x] 4.1 Implement `save-memory.tool.ts` and `forget-memory.tool.ts` factories, register them in `TOOL_FACTORIES` and `LOCAL_TOOL_NAMES`, and pass `MemoryService` through `AgentToolDeps`
- [x] 4.2 Load the owner's memories once at the start of `AgentService.run` (owner from the run context) and pass them to `createMultiAgentMiddleware`
- [x] 4.3 Extend `composePrompt` to append the "What you remember about this user" block (short ids, clipped content, not-instructions note) and leave the prompt unchanged when empty or disabled
- [x] 4.4 Record the injected memory texts in the chat-log LLM event metadata
- [x] 4.5 Add tests: tool results (success, duplicate, memory full evicts the oldest and succeeds, duplicate when full changes nothing, forget by short id, foreign id, disabled), tool schemas, prompt block (limit, order, empty, disabled)

## 5. Replay

- [x] 5.1 Make replay inject the memories recorded in the log metadata into both runs and read nothing from `user_memories`
- [x] 5.2 Replace `saveMemory`/`forgetMemory` with no-op recorders in replay and extend replay tests (same memories in both runs, nothing persisted)

## 6. Web

- [x] 6.1 Add memory API client functions and the Memory page (list, add, inline edit, delete with confirmation, empty state); for admins call the admin endpoints, show an Email column and a debounced email filter input, and hide both for non-admins
- [x] 6.2 Add the first-level **Memory** menu item and route

## 7. Docs and verification

- [x] 7.1 Document the feature and `settings.memory` in README / `docs/config-sample` README
- [x] 7.2 Run lint, type-check, unit tests and the build for `shared`, `api` and `web`; run the migration against a local database
- [ ] 7.3 Manually verify in the app: agent saves a memory (and the user's email in `users`), a new session recalls it, the Memory page edits/deletes it, an admin sees all users' memories and the email filter narrows them, and disabling `settings.memory.enabled` stops injection and writes
