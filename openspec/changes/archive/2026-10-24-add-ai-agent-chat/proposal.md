## Why

Chat currently echoes the user's input as a placeholder. To deliver a real AI conversation, the API must call an LLM through an agent framework that can also use tools, and surface the agent's reasoning and tool activity to the user.

## What Changes

- Add a LangChain agent (`langchain` `createAgent` + `@langchain/anthropic`) in the API, backed by a Claude model.
- Read the model endpoint and credentials from the environment variables `MODEL_BASE_URL` and `MODEL_API_KEY`; nothing is hard-coded. Other parameters (model name, system prompt, max context, token limit, adaptive thinking and its effort level, max tool iterations) are code constants for now.
- Add tools injected into the agent: `getWeather`, `getUsers`, `sendMail` (mock, never sends) and `renameSession` (sets a readable session name; the prompt asks the agent to summarize the conversation into a title).
- Tools are factories that receive an `AgentToolContext` (per-run session id from the caller, shared repositories from `AgentService`), so the LLM never supplies ids or handles.
- Add session deletion: `DELETE /chat/sessions/:id` cascades to messages; the session list shows a hover delete icon with a confirmation dialog.
- Replace the placeholder `ChatService.think()` echo: sending a chat message now invokes the agent with the session history and streams the result.
- Persist the AI reasoning, tool call arguments and tool call results, in order, as the `chat_messages.thinking` text of the assistant message; the final answer remains `content`.
- **BREAKING**: the echo behavior ("thinking = answer = user input") is removed.

## Capabilities

### New Capabilities
- `ai-agent`: LangChain agent configuration (env-driven Claude connection, fixed parameters) the tool context pattern, and the `getWeather`, `getUsers`, `sendMail` and `renameSession` tools.

### Modified Capabilities
- `chat-sessions`: the agent may rename a session after the first-message name; new requirement to delete a session (API and web).
- `chat-conversation`: the streamed thinking/answer requirement now comes from the agent (reasoning + tool calls/results as thinking) instead of the echo placeholder; failures of the model call are reported.

## Impact

- API: new `apps/api/src/agent/` module; `chat.controller.ts` / `chat.service.ts` call the agent; `config/env.ts` gains `model.baseUrl` / `model.apiKey`; `.env.example` documents both variables.
- Dependencies: `langchain`, `@langchain/core`, `@langchain/anthropic`, `zod` added to `@app/api`.
- Shared: `ChatStreamEvent` gains an `error` event.
- Web: session list delete icon + confirmation `Modal`; handles the `error` event; thinking panel already renders arbitrary text.
- No database migration (`thinking` is already a nullable text column).
