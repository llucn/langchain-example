## 1. Configuration and dependencies

- [x] 1.1 Add `langchain`, `@langchain/core`, `@langchain/anthropic` and `zod` to `apps/api`
- [x] 1.2 Extend `config/env.ts` with `model.baseUrl` and `model.apiKey` from `MODEL_BASE_URL` / `MODEL_API_KEY`
- [x] 1.3 Document both variables in `.env.example` and pass them through `docker-compose.yml`

## 2. Agent module

- [x] 2.1 Create `agent/agent.config.ts` with the fixed parameters
- [x] 2.2 Implement the `getWeather` tool (mock data, zod schema)
- [x] 2.3 Implement the `getUsers` tool (TypeORM, restricted fields, limit cap)
- [x] 2.4 Implement `AgentService.run` with `createAgent` and `ChatAnthropic`, history trimming, and a clear error when env vars are missing
- [x] 2.5 Fold stream events into thinking deltas (reasoning, tool call, tool result) and return the final answer
- [x] 2.6 Register `AgentModule` and import it in `ChatModule`

## 3. Chat integration

- [x] 3.1 Replace `ChatService.think()` with the agent call in `ChatController.send`
- [x] 3.2 Add the `error` event to `ChatStreamEvent` in `@app/shared` and emit it on failure
- [x] 3.3 Handle the `error` event in the web chat client and page

## 4. Tests

- [x] 4.1 Unit test the tools (limit cap, no `sub` leaked, weather shape)
- [x] 4.2 Unit test thinking folding and context trimming with a fake model
- [x] 4.3 Run lint, build and tests for api and web
