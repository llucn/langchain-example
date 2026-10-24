## Context

The monorepo has a NestJS API (TypeORM/Postgres, optional Cognito JWT auth via a global guard that sets `req.user`), a React web app (HashRouter, design-system components) and a shared types package. There is no chat feature. Real AI is out of scope for now, but the API contract must already support a "thinking, then answer" interaction.

## Goals / Non-Goals

**Goals:**
- Persist chat sessions and messages.
- Stream the thinking process and final answer to the browser as they are produced.
- Isolate the future AI to a single seam.

**Non-Goals:**
- Real AI/LLM calls, tool use, or retrieval.
- Renaming/deleting sessions, pagination, search, multi-user sharing.
- Cancelling an in-flight response.

## Decisions

- **Two tables.** `chat_sessions(id, ownerSub, name, startedAt)` and `chat_messages(id, sessionId FK cascade, role, content, thinking, createdAt)`. The thinking text is stored on the assistant message rather than as its own row, since it belongs to exactly one answer. Alternative: a `thinking` role row per turn — rejected as it complicates ordering and rendering.
- **Session name set server-side on the first message** (whitespace collapsed, max 80 chars), so every client gets identical naming. A session starts with a null name and the UI shows "New chat".
- **Owner scoping via `ownerSub`** taken from the validated token; null when auth is disabled. Unknown or foreign sessions return 404.
- **Streaming via SSE over POST.** `POST /chat/sessions/:id/messages` responds `text/event-stream` with events `session`, `user`, `thinking` (deltas), `assistant`. The web client reads it with `fetch` streaming, since `EventSource` cannot POST or send an auth header. Alternatives: WebSocket (heavier, needs auth plumbing), polling (poor UX).
- **AI seam:** `ChatService.think(input)` returns `{ thinking, answer }`; today both equal the input. The controller emits thinking word by word with a short delay to exercise the streaming path.
- **Frontend:** one route `/chat/:sessionId?` so the page stays mounted when the first send creates a session and navigates; a ref prevents the message reload from clobbering in-flight local state.
- **Shared types** (`ChatSession`, `ChatMessage`, `ChatStreamEvent`) live in `@app/shared` so API and web agree.

## Risks / Trade-offs

- [Reverse proxies buffering SSE] → send `X-Accel-Buffering: no` and `no-transform`; Vite dev proxy passes streams through.
- [Client disconnects mid-stream] → the user message is already saved; the reply may still be saved but not delivered. Acceptable for the placeholder; revisit with real AI.
- [Artificial per-word delay] → remove when real AI streams tokens.
- [Auth disabled lists all sessions] → intended for local development only.
