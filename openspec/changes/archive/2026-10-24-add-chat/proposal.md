## Why

The app has no conversational interface yet. We want the Chat experience (session list, bubble conversation view, persisted history) in place before wiring in real AI, so the AI work can later replace one placeholder function instead of also building UI and storage.

## What Changes

- Add Chat Session and Chat Message persistence (new tables, migration, entities).
- Add chat REST API: create/list sessions, list messages, send a message with a streamed (SSE) response carrying the thinking process and the final answer.
- Placeholder "AI": the user's input is echoed verbatim as both the thinking and the answer.
- Add a Chat page to the web app: session list (name + start time, newest first) and a standard bubble conversation view that shows the thinking process while the server works, then the answer.
- Session name is the first user message.
- Share chat types via `@app/shared`.

## Capabilities

### New Capabilities
- `chat-sessions`: creating, listing and naming chat sessions, scoped to the signed-in user.
- `chat-conversation`: sending messages, streaming thinking and answer, persisting messages, and the bubble conversation UI.

### Modified Capabilities

## Impact

- API: new `chat` module, `chat_sessions` / `chat_messages` entities, migration `1700000000001-chat`, `/api/chat/sessions` endpoints.
- Web: new `/chat/:sessionId?` route, `ChatPage`, `lib/chat.ts`, `apiRequest` helper in `lib/api.ts`, Chat nav item.
- Shared: new chat types in `packages/shared/src/types.ts`.
- No new dependencies.
