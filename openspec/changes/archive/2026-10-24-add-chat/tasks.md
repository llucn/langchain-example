## 1. Shared and data model

- [x] 1.1 Add `ChatSession`, `ChatMessage`, `ChatStreamEvent` types to `@app/shared`
- [x] 1.2 Add `ChatSession` and `ChatMessage` entities and register them in the data source
- [x] 1.3 Add migration `1700000000001-chat` and run it

## 2. API

- [x] 2.1 Add `ChatService` (create/list sessions, list messages, naming, placeholder `think`)
- [x] 2.2 Add `ChatController` with SSE send endpoint and owner scoping
- [x] 2.3 Add `SendMessageDto` validation and register `ChatModule` in `AppModule`
- [x] 2.4 Verify with curl: echo thinking/answer, naming, history, empty message 400

## 3. Web

- [x] 3.1 Add `apiRequest` helper and `lib/chat.ts` SSE client
- [x] 3.2 Add `ChatPage` with session list, bubbles, live thinking bubble and input
- [x] 3.3 Add Chat nav item and `/chat/:sessionId?` route
- [x] 3.4 Verify in browser: new chat, follow-up message, reload history

## 4. Follow-ups

- [ ] 4.1 Add automated tests (service unit tests, e2e for the SSE endpoint)
- [ ] 4.2 Replace `ChatService.think` with the real AI integration
