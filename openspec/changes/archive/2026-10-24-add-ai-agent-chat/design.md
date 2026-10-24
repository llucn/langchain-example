## Context

`POST /chat/sessions/:id/messages` streams SSE events (`session`, `user`, `thinking` deltas, `assistant`). The thinking and answer currently come from `ChatService.think()`, an echo placeholder. `chat_messages.thinking` is a nullable text column on assistant messages. Users live in the `users` table (`sub`, `email`, `createdAt`), accessed through TypeORM.

## Goals / Non-Goals

**Goals:**
- Real Claude responses through a LangChain agent, with `getWeather` and `getUsers` tools.
- Connection settings only from `MODEL_BASE_URL` / `MODEL_API_KEY`.
- The streamed and stored thinking contain the reasoning, tool call arguments and tool results.

**Non-Goals:**
- Making the model name, system prompt, max context etc. configurable (constants for now).
- A real weather provider (stub data), tool management UI, token-level answer streaming.
- Cross-session memory or RAG.

## Decisions

**Agent module.** New `AgentModule` exposing `AgentService.run(history, onThinking)`; `ChatController` uses it instead of `think()`. Keeps LLM code out of chat persistence.
- Framework: `createAgent` from `langchain` with `ChatAnthropic` from `@langchain/anthropic`. Alternative: LangGraph `createReactAgent`; rejected because `createAgent` is the current high-level API.
- Connection: `new ChatAnthropic({ apiKey: MODEL_API_KEY, anthropicApiUrl: MODEL_BASE_URL, model })`, so a gateway/proxy base URL works. If either variable is missing the API still boots, and the chat call fails with a clear error.

**Fixed parameters** live in `agent/agent.config.ts`: model name (a Claude model), `maxTokens` 4096, adaptive thinking (`thinking.type = "adaptive"`, as the model rejects `enabled`) with `outputConfig.effort = "medium"` instead of a token budget, a short system prompt (assistant persona that uses the tools), `MAX_CONTEXT_MESSAGES = 20`, and a recursion limit of 10 steps.

**Context window.** The agent receives the last `MAX_CONTEXT_MESSAGES` persisted messages of the session (user and assistant `content` only; stored thinking is not replayed), oldest first, ending with the new user message.

**Tools** (`agent/tools/`), defined with `tool()` and zod schemas, injected as Nest providers:
- `getWeather({ city })`: returns deterministic mock data (condition, temperature in °C, humidity) derived from the city name. No external API.
- `getUsers({ limit? })`: reads the `users` table through TypeORM and returns `id`, `email`, `createdAt` (never `sub`); default limit 10, max 50, newest first.

**Tool context.** Tools are factories `(ctx: AgentToolContext) => tool`, listed in `tools/index.ts`. `AgentRunContext` (`sessionId`) is passed by the caller to `AgentService.run`; `AgentToolDeps` (`users`, `sessions` repositories) is held by `AgentService`. The two are merged per run, so tool schemas expose only LLM-chosen arguments. New tools follow the same shape.
- `sendMail({ to: string[], subject, body })`: mock, always returns `success: true`, sends nothing.
- `renameSession({ name })`: normalizes (whitespace, 80 chars), updates the context session, rejects empty names. The system prompt asks for a title of at most 30 characters on the first reply and on large topic changes. After the run the controller re-emits the `session` event.

**Session deletion.** `DELETE /chat/sessions/:id` checks ownership (404 otherwise) and deletes the session; the existing `ON DELETE CASCADE` foreign key removes its messages. The web list shows a trash icon on row hover/focus and confirms in a `Modal`.

**Thinking capture.** Run `agent.stream(..., { streamMode: ["messages", "updates"] })` and fold events into one ordered thinking text, emitting each addition as a `thinking` delta:
- Claude `thinking` content blocks are appended as-is.
- A tool call is appended as `[Tool call] getWeather {"city":"Paris"}`.
- A tool result is appended as `[Tool result] getWeather {...}`.

The final AI message text is the answer (`content`). The accumulated thinking is saved on the assistant message as `thinking`. If a run ends without any thinking, `thinking` is stored as an empty string.

**Errors.** If the agent call fails, the controller emits a new SSE `error` event (`{ type: "error", message }`), stores no assistant message, and ends the stream. The user message stays persisted.

## Risks / Trade-offs

- [Gateway may not support adaptive thinking or `outputConfig.effort`] → both are set in one place in `agent.service.ts`, easy to drop; tool calls and results still fill `thinking`.
- [Mock weather data may be mistaken for real data] → tool output carries `source: "mock"` and the system prompt says so.
- [`getUsers` exposes user emails to any chat user] → restricted fields only, hard limit of 50; revisit with per-role access later.
- [Long history raises cost] → capped by `MAX_CONTEXT_MESSAGES`.
