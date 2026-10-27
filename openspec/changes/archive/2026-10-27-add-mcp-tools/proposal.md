## Why

The agent's tools today are local (mock weather, user lookup, mock mail). The business data and operations live behind four remote MCP servers (user, asset, location, work-order) that already authenticate with the same Cognito user pool. Connecting the agent to them lets it answer and act on real data on behalf of the signed-in user.

## What Changes

- Add MCP client support to the API: on each agent run, connect to the configured remote MCP servers over streamable HTTP, load their tools and give them to the agent (`@langchain/mcp-adapters`).
- MCP server URLs come from environment variables (one per server: `MCP_USER_URL`, `MCP_ASSET_URL`, `MCP_LOCATION_URL`, `MCP_WORK_ORDER_URL`), never from source code. A server whose variable is unset is skipped. `.env.example` documents them (the four CloudFront URLs as examples).
- Authenticate to every MCP server with the **caller's own Cognito ID token** (the `Authorization: Bearer` token of the chat request, which the web app now sends as its ID token), forwarded as-is. All servers share the same Cognito client as the API, so no separate MCP credentials exist.
- Tool names from MCP servers are prefixed with the server name (e.g. `asset_…`) so tools of different servers cannot collide with each other or with `renameSession`.
- An MCP server that is unreachable or rejects the token is logged and skipped for that run; the chat still works with the remaining tools.
- Reduce the agent's local function tools to `renameSession` only. `getWeather`, `getUsers` and `sendMail` are removed from the agent's tool registry; their source files and tests stay in the repo, unreferenced by the agent.
- Update the system prompt: drop the weather/users/mail guidance, keep session naming, and tell the agent to use the MCP tools for user, asset, location and work-order questions.

## Capabilities

### New Capabilities
- `mcp-tools`: configuration of remote MCP servers from the environment, per-run connection authenticated with the visitor's ID token, tool loading and naming, and failure tolerance.

### Modified Capabilities
- `ai-agent`: the agent's tool set is `renameSession` plus the MCP tools; the `getWeather`, `getUsers` and `sendMail` requirements are removed; the tool-context requirement also carries the caller's ID token as a per-run value.

## Impact

- API: new `apps/api/src/agent/mcp/` (client factory); `agent.service.ts` builds the tool list per run from `buildTools` + MCP tools and closes the MCP connections when the run ends; `agent.context.ts` gains `idToken`; `tools/index.ts` registers only `renameSession`; `agent.config.ts` system prompt; `chat.controller.ts` passes the request's bearer token into `AgentService.run`; `config/env.ts` gains `mcp.servers`.
- Config: four new optional env variables in `.env.example` (and docker compose if it lists env explicitly).
- Dependencies: `@langchain/mcp-adapters` added to `@app/api`.
- Web: `AuthProvider` registers the ID token (not the access token) for API calls.
- Behavior: with `AUTH_ENABLED=false` there is no token, so MCP servers are skipped (the agent only has `renameSession`).
- No database migration.
