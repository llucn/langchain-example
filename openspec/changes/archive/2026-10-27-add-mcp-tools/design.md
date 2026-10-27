## Context

`AgentService.run` builds a LangChain agent (`createAgent`) per request with tools from `buildTools` (factories receiving `AgentRunContext` + repositories). The chat controller already runs behind `JwtAuthGuard`, which validates Cognito JWTs (signature, issuer, audience = the shared client id) and puts the payload on `req.user`; the raw token is in the `Authorization` header. The web app sends the Cognito **ID token** (the MCP servers accept the ID token, not the access token).

Four remote MCP servers exist (`…/api/mcp/{user,asset,location,work-order}`). They validate Cognito JWTs of the same client, so the token the API received from the visitor is acceptable to them.

## Goals / Non-Goals

**Goals:**
- The agent can call tools exposed by the four MCP servers, acting as the signed-in visitor.
- Server URLs are configuration, not code; adding a fifth server is an env/config change, not a rewrite.
- The agent's local tools are just `renameSession`.

**Non-Goals:**
- Token exchange, refresh or service-to-service credentials (the visitor's ID token is forwarded unchanged).
- Caching MCP connections across requests or users.
- Deleting the `getWeather` / `getUsers` / `sendMail` code, or changing the web UI.
- MCP resources/prompts; only tools are used.

## Decisions

**1. `@langchain/mcp-adapters` `MultiServerMCPClient`, streamable HTTP.**
It returns LangChain tools directly, so they plug into `createAgent` with no glue. The servers are plain HTTPS endpoints, so transport is `http` (streamable HTTP) with `headers: { Authorization: 'Bearer <jwt>' }`. Alternative: the raw `@modelcontextprotocol/sdk` and hand-written tool wrappers — more code, no benefit.

**2. One client per agent run, closed in `finally`.**
The ID token is per visitor and short-lived, so a shared/long-lived client would either leak one user's identity to another or hold an expired token. Creating the client per run costs a few round trips but is always correct. Alternative: pool by user with TTL — rejected as premature.

**3. URLs from four explicit env variables, parsed into `env.mcp.servers`.**
`MCP_USER_URL`, `MCP_ASSET_URL`, `MCP_LOCATION_URL`, `MCP_WORK_ORDER_URL`; the server name (`user`, `asset`, `location`, `work-order`) is fixed in code next to the variable name, the URL is not. Unset/empty → server skipped. Alternative: one `MCP_SERVERS` JSON variable — more flexible but harder to set in docker/ECS and to read in `.env.example`; can be added later without breaking this.

**4. Tool names prefixed with the server name** (`prefixToolNameWithServerName: true`, giving e.g. `asset__list_assets`; `work-order` is normalized to a valid tool-name character set by the adapter/our mapping key `work_order`). Prevents collisions between servers and with `renameSession`, and tells the LLM (and the thinking panel) which system a tool belongs to.

**5. Fail soft per server.**
Use the adapter's per-server tool loading (`throwOnLoadError: false`, i.e. skip failing servers) and log a warning with the server name and error (never the token). A 401/timeout from one server must not abort the chat reply. Tool *call* errors are returned to the model as tool results (the adapter already does this), so the agent can explain them.

**6. The visitor's ID token travels via `AgentRunContext.idToken`.**
The controller reads the bearer token from the request and passes `{ sessionId, idToken }` to `AgentService.run` — consistent with the existing "per-run values come from the caller" rule. When auth is disabled (`AUTH_ENABLED=false`) or the header is absent, `idToken` is undefined and MCP servers are skipped entirely, rather than calling them unauthenticated.

**7. Local tools: unregister, don't delete.**
`TOOL_FACTORIES` keeps only `createRenameSessionTool`. The other tool files and their unit tests remain and keep compiling; they are simply no longer imported by `tools/index.ts`. The system prompt drops their instructions (a prompt that mentions missing tools would make the model hallucinate calls).

**8. Where the code lives.**
`agent/mcp/mcp.config.ts` (server names ↔ env keys), `agent/mcp/mcp.client.ts` (`connectMcp(servers, idToken, logger) → { tools, close }`). `AgentService` composes: `[...buildTools(ctx), ...mcp.tools]`, and `await mcp.close()` in `finally`.

## Risks / Trade-offs

- **ID token, not access token** — the MCP servers require the Cognito ID token (confirmed). The web therefore sends the ID token on every API call; the API accepts it (`aud` = client id) and forwards it unchanged → the ID token has the same lifetime as the access token and is refreshed with it.
- **Token expiry mid-run** — a very long run could outlive the JWT → runs are bounded by `AGENT_RECURSION_LIMIT`; an expired token surfaces as a tool error the model reports.
- **Latency** — connecting to 4 servers per message adds time → connect in parallel, with a connection timeout; skipped servers degrade gracefully.
- **Tool sprawl** — many MCP tools inflate the prompt and tokens → acceptable now (4 servers); revisit with per-question server selection if it grows. `AGENT_MAX_TOKENS`/recursion limit unchanged.
- **Token forwarding** — the visitor's ID token is sent to the configured URLs → URLs come only from trusted server-side config; never log headers.
- **Prompt injection via MCP results** — tool results are untrusted data fed to the model; MCP servers enforce authorization with the visitor's identity, so the blast radius is that visitor's own permissions.

## Open Questions

- Should the MCP tool list be filtered to read-only tools, or are write tools (e.g. creating work orders) allowed straight from chat? Default in this change: all tools the server exposes to the visitor.
