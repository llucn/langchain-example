## Why

The chat uses one agent with one prompt and every MCP tool, so it cannot specialise: fault reports, work-order lookups and small talk all share the same instructions and tools. Splitting the work across purpose-built agents (a router plus downstream agents) gives each a focused prompt and a minimal tool set, and prepares the ground for managing agent definitions as configuration later.

## What Changes

- Introduce a multi-agent architecture built as **one LangChain agent with state-driven dynamic configuration**: a middleware reads `currentAgent` from the agent state and, before every model call, swaps the system prompt, model parameters and visible tools to that agent's definition.
- Add four agents defined in code in `AGENTS` (`agent.config.ts`): `selector` (routes), `fault_report`, `work_order_inquiry`, `other`.
- Add a `selectAgent(agentName, confidence, summary)` tool, available to the selector only. It switches `currentAgent`, stores the routing summary in the state, and the run continues in the same request, so the user's message is answered immediately by the downstream agent.
- The selector may ask clarifying questions for up to 5 turns; the last turn falls back to `other`. A low-confidence `selectAgent` call is rejected by the server, not just by the prompt.
- Persist the active agent per chat session (new `chat_sessions.agent` column, default `selector`) so later messages continue with the chosen agent.
- `renameSession` moves from the single agent to the downstream agents; each agent only sees the local tools and MCP servers its definition lists.
- Clean up the draft `AGENTS` definitions (see design.md): connection settings are not part of an agent definition and come from `loadEnv`, MCP servers are referenced by name, prompts are completed.
- Agent definitions stay hard-coded. **Not in scope**: dynamic configuration, a configuration UI, versioning of definitions (a `version` field is kept in each definition as a hook for that later work).

## Capabilities

### New Capabilities
- `multi-agent`: agent definitions, routing from the selector to a downstream agent, state-driven switching inside one agent run, and persistence of the active agent per chat session.

### Modified Capabilities
- `ai-agent`: model parameters and system prompt become per agent definition (connection stays environment-driven); `renameSession` belongs to the downstream agents; the tool set is per agent instead of one global set.
- `mcp-tools`: tools of an MCP server are given only to the agents whose definition lists that server.

## Impact

- Code: `apps/api/src/agent/` (`agent.config.ts`, `agent.service.ts`, `agent.context.ts`, `mcp/mcp.client.ts`, new `tools/select-agent.tool.ts`, new middleware file), `apps/api/src/chat/chat.controller.ts` and `chat.service.ts` (load and save the active agent), `chat-session.entity.ts` plus a new migration.
- Database: one new column on `chat_sessions` (default keeps existing sessions working: they start at `selector`).
- Dependencies: `@langchain/langgraph` becomes a direct dependency of `@app/api` (for `Command`; already installed transitively).
- Environment variables: none added or renamed; `MODEL_BASE_URL`, `MODEL_API_KEY` and `MCP_*_URL` keep their meaning and are read only through `loadEnv`.
- API / web: no change to the HTTP or SSE contract; the switch is visible in the existing `thinking` stream as a `[Tool call] selectAgent …` line.
