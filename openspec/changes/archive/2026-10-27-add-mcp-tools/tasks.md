## 1. Configuration and dependency

- [x] 1.1 Add `@langchain/mcp-adapters` to `@app/api` and install
- [x] 1.2 Add `mcp.servers` (name → URL from `MCP_USER_URL`, `MCP_ASSET_URL`, `MCP_LOCATION_URL`, `MCP_WORK_ORDER_URL`; empty = omitted) to `AppEnv` / `loadEnv` in `config/env.ts`
- [x] 1.3 Document the four variables in `.env.example` (and docker compose / README env lists if present)

## 2. MCP client

- [x] 2.1 Add `agent/mcp/mcp.client.ts`: `connectMcp(servers, idToken)` using `MultiServerMCPClient` (streamable HTTP, `Authorization: Bearer` header, tool names prefixed with server name, skip failing servers with a warning that never logs the token) returning `{ tools, close }`; returns no tools and no connections when there are no servers or no token
- [x] 2.2 Unit-test `connectMcp`: no token → no connection; unset URLs skipped; header carries the token; one failing server does not drop the others (mock the adapter)

## 3. Agent wiring

- [x] 3.1 Add `idToken?: string` to `AgentRunContext`; have `ChatController.send` pass the request's bearer token to `AgentService.run`
- [x] 3.2 In `AgentService.run`, build tools as `[...buildTools(ctx), ...mcp.tools]` and close the MCP connections in `finally`
- [x] 3.3 Reduce `TOOL_FACTORIES` in `tools/index.ts` to `createRenameSessionTool` only (leave the getWeather/getUsers/sendMail files and their tests in place)
- [x] 3.4 Update `AGENT_SYSTEM_PROMPT`: remove weather/users/mail/mock-weather sentences, keep session naming, add MCP tool guidance (users, assets, locations, work orders)
- [x] 3.5 Update `agent.service.spec.ts` / `tools.spec.ts` if they depend on the old registry; add a test that the registry contains only `renameSession`

## 4. Verification

- [x] 4.1 Run lint, typecheck and unit tests for `@app/api`
- [ ] 4.2 Manual check with a real Cognito ID token: each of the four servers loads tools, an MCP tool call succeeds, and an unreachable URL is skipped without breaking the chat
- [x] 4.3 Token type: the MCP servers require the ID token; web sends `id_token` (`AuthProvider.tsx`) and the design notes it
