## ADDED Requirements

### Requirement: Per-user memory store
The system SHALL store memories as short text notes, each with a unique id, an owner (the visitor's OIDC subject; a single shared owner when authentication is disabled), a source (`agent` or `user`), the optional chat session it came from, and created and updated timestamps. A memory's content SHALL have whitespace collapsed and SHALL be 1 to 500 characters. A user SHALL have at most 200 memories. A memory SHALL NOT store the owner's username or email; the owner's email is the `email` of the `users` row with the same `sub`, which the system SHALL create or update from the validated token when the user logs in (see "User record on login"). Deleting a chat session SHALL keep its memories and clear their session reference.

#### Scenario: Stored with owner and source
- **WHEN** the agent saves "Prefers answers in Chinese" during a session of user A
- **THEN** a memory owned by A with source `agent` and that session's id is stored

#### Scenario: Memory stores only the owner
- **WHEN** user `alice@example.com` creates a memory
- **THEN** the memory carries only her `sub`, and her email is found through the `users` row

#### Scenario: Content limits
- **WHEN** a memory with blank content, or with more than 500 characters, is submitted
- **THEN** it is rejected and nothing is stored

#### Scenario: Per-user cap on manual create
- **WHEN** a user already has 200 memories and adds another on the Memory page (or through `POST /api/memories`)
- **THEN** it is rejected with a message saying the memory is full

#### Scenario: Session deleted
- **WHEN** the session a memory came from is deleted
- **THEN** the memory still exists and has no session reference

### Requirement: User record on login
When an authenticated user logs in (the web app's `GET /api/auth/me` call after sign-in), the system SHALL ensure a `users` row exists for the token's `sub` with the token's `email`: insert it when missing, update `email` when it differs, and write nothing when it is unchanged. It SHALL do nothing when authentication is disabled or the token has no `sub`, and a failure to write SHALL NOT fail the request.

#### Scenario: First login
- **WHEN** `alice@example.com` logs in and has no `users` row
- **THEN** a `users` row with her `sub` and email is created

#### Scenario: Email changed
- **WHEN** her token's email differs from the stored one at the next login
- **THEN** the stored email is updated

#### Scenario: Unchanged
- **WHEN** she logs in again with the same email
- **THEN** no row is written

#### Scenario: Authentication disabled
- **WHEN** `AUTH_ENABLED=false`
- **THEN** no `users` row is written

### Requirement: Memory API
The system SHALL provide authenticated endpoints under `/api/memories` to list (newest first), create (source `user`), edit and delete memories, each scoped to the caller's own memories. Another user's memory SHALL be reported as not found. Unauthenticated calls SHALL be answered with 401.

#### Scenario: List own memories
- **WHEN** user A lists memories
- **THEN** only A's memories are returned, newest first

#### Scenario: Other user's memory
- **WHEN** user A edits or deletes the id of a memory owned by user B
- **THEN** the system responds 404 and B's memory is unchanged

#### Scenario: Create and edit
- **WHEN** user A creates a memory "Works in building 3" and then edits it to "Works in building 5"
- **THEN** the list shows one memory with the edited content, source `user` and a later updated time

### Requirement: Admin memory management
Admins (see `admin-access`) SHALL be able to list, edit and delete the memories of all users through admin-only endpoints under `/api/admin/memories`. The list SHALL be newest first and paged, and SHALL accept an optional `email` filter that matches memories whose owner's email (from the `users` table) contains the given text, ignoring case; a blank filter SHALL match all memories, and memories whose owner has no email SHALL match no non-blank filter. Each listed memory SHALL include its owner's email. An admin edit SHALL keep the memory's owner and source. Non-admins SHALL receive 403 and unauthenticated calls 401. Agents SHALL still only read and write the memories of the session's own owner.

#### Scenario: Admin lists everyone's memories
- **WHEN** an admin lists memories without a filter
- **THEN** memories of all users are returned, each with its owner's email, newest first

#### Scenario: Filter by email
- **WHEN** an admin filters with `ali`, and `alice@example.com` and `bob@example.com` have memories
- **THEN** only alice's memories are returned, and `ALI` gives the same result

#### Scenario: Admin edits and deletes
- **WHEN** an admin edits a memory of `alice` and deletes another
- **THEN** the edit keeps alice as owner and the deleted memory is gone from alice's own list

#### Scenario: Non-admin
- **WHEN** a non-admin calls `/api/admin/memories`
- **THEN** the system responds 403

#### Scenario: Agent isolation
- **WHEN** an agent run for user A calls `forgetMemory` with the id of user B's memory
- **THEN** it fails and B's memory is unchanged, whether or not A's session is an admin's

### Requirement: saveMemory and forgetMemory tools
The system SHALL provide the local tools `saveMemory` (argument `content`) and `forgetMemory` (argument `id`), available to an agent only when its definition lists them. The owner and the session SHALL come from the run context, not from tool arguments. `saveMemory` SHALL store the memory with source `agent`, and SHALL succeed without adding a row when an identical memory (case-insensitive) already exists. When the owner already has the maximum number of memories, `saveMemory` SHALL NOT refuse or fail: it SHALL delete the owner's oldest memory (by creation time) and store the new one, so the owner never has more than the maximum. `forgetMemory` SHALL delete the owner's memory with that id (the full id or the 8-character short id shown to the agent) and fail when none matches. Both SHALL report `success` or an `error` as JSON, and SHALL fail without changing anything when memory is disabled.

#### Scenario: Agent saves a memory
- **WHEN** the agent calls `saveMemory` with "Usually reports faults for the Admin Building"
- **THEN** the memory is stored for the session's owner and the tool returns `success: true`

#### Scenario: Memory full
- **WHEN** the owner has 200 memories and the agent calls `saveMemory` with a new fact
- **THEN** the owner's oldest memory is deleted, the new one is stored, the owner still has 200 memories and the tool returns `success: true`

#### Scenario: Duplicate when full
- **WHEN** the owner has 200 memories and the agent saves a memory identical to an existing one
- **THEN** nothing is deleted or added and the tool returns success

#### Scenario: Duplicate
- **WHEN** the agent saves a memory identical to an existing one
- **THEN** the tool returns success and the number of memories is unchanged

#### Scenario: Forget by short id
- **WHEN** the agent calls `forgetMemory` with the short id of one of the owner's memories
- **THEN** that memory is deleted and the tool returns `success: true`

#### Scenario: Unknown or foreign id
- **WHEN** `forgetMemory` is called with an id that is not one of the owner's memories
- **THEN** it returns `success: false` with an error and deletes nothing

#### Scenario: Owner is not an LLM argument
- **WHEN** the tool schemas are inspected
- **THEN** `saveMemory` exposes only `content` and `forgetMemory` only `id`

#### Scenario: Memory disabled
- **WHEN** `settings.memory.enabled` is false and the agent calls `saveMemory`
- **THEN** the tool returns `success: false` saying memory is disabled and nothing is stored

### Requirement: Memory page
The web app SHALL provide a first-level menu item **Memory**, visible to every signed-in user, with a page that lists the user's memories (content, source, last updated) and lets the user add a memory, edit a memory inline and delete a memory after confirmation. For admins the page SHALL list the memories of all users, show each memory's owner email, offer an input that filters by email, and allow editing and deleting any of them. An empty list SHALL show an explanation of what memory is.

#### Scenario: Admin view with email filter
- **WHEN** an admin opens Memory
- **THEN** the page lists all users' memories with an Email column and an email input, and typing `ali` shows only memories whose owner's email contains `ali`

#### Scenario: Non-admin view
- **WHEN** a non-admin opens Memory
- **THEN** only their own memories are shown, without an Email column or filter input

#### Scenario: Add and delete
- **WHEN** the user adds "Prefers email over phone" and later deletes it after confirming
- **THEN** it appears in the list after adding and is gone after deleting

#### Scenario: Empty
- **WHEN** the user has no memories
- **THEN** the page shows an empty state explaining that agents can remember durable facts and the user can add their own
