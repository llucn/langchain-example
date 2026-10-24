## Why

Chat currently echoes the user's input as a placeholder. To deliver a real AI conversation, the API must call an LLM through an agent framework that can also use tools, and surface the agent's reasoning and tool activity to the user.

## What Changes

- Add a LangChain agent (`langchain` `createAgent` + `@langchain/anthropic`) in the API, backed by a Claude model.
- Read the model endpoint and credentials from the environment variables `MODEL_BASE_URL` and `MODEL_API_KEY`; nothing is hard-coded. Other parameters (model name, system prompt, max context, temperature, thinking budget, max tool iterations) are code constants for now.
- Add two tools injected into the agent: `getWeather` and `getUsers`.
- Replace the placeholder `ChatService.think()` echo: sending a chat message now invokes the agent with the session history and streams the result.
- Persist the AI reasoning, tool call arguments and tool call results, in order, as the `chat_messages.thinking` text of the assistant message; the final answer remains `content`.
- **BREAKING**: the echo behavior ("thinking = answer = user input") is removed.

## Capabilities

### New Capabilities
- `ai-agent`: LangChain agent configuration (env-driven Claude connection, fixed parameters) and the `getWeather` / `getUsers` tools.

### Modified Capabilities
- `chat-conversation`: the streamed thinking/answer requirement now comes from the agent (reasoning + tool calls/results as thinking) instead of the echo placeholder; failures of the model call are reported.

## Impact

- API: new `apps/api/src/agent/` module; `chat.controller.ts` / `chat.service.ts` call the agent; `config/env.ts` gains `model.baseUrl` / `model.apiKey`; `.env.example` documents both variables.
- Dependencies: `langchain`, `@langchain/core`, `@langchain/anthropic`, `zod` added to `@app/api`.
- Shared: `ChatStreamEvent` gains an `error` event.
- Web: handles the `error` event; thinking panel already renders arbitrary text.
- No database migration (`thinking` is already a nullable text column).
