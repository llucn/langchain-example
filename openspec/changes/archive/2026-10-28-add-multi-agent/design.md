## Context

`AgentService.run` builds a fresh `createAgent` per request: history comes from the database (user/assistant text only, trimmed to 20), tools are `renameSession` plus the tools of every reachable MCP server, and the model connection comes from `AppEnv.model`. The agent has no checkpointer, so nothing but the stored messages survives between requests.

A draft `AGENTS` constant already exists in `agent.config.ts` (uncommitted). It is the starting point for the agent definitions, but it has defects that matter once it is used for real (reviewed below).

The routing options were compared in the exploration that preceded this change; this design implements option "single agent + state-driven dynamic configuration" using LangChain v1 middleware (`wrapModelCall` can override `model`, `systemPrompt` and `tools` per model call; the installed `langchain@1.5.19` supports it).

## Goals / Non-Goals

**Goals:**
- Route the first meaningful user input to `fault_report`, `work_order_inquiry` or `other` with a selector agent, inside one agent run, without an extra user message.
- Keep the active agent across requests of a session.
- Keep agent definitions as plain data so they can later be loaded from storage unchanged.
- No new environment variables; env access stays centralised in `loadEnv`.

**Non-Goals:**
- Dynamic agent configuration, an editing UI, versioned definitions.
- Switching agents after the first routing (no transfer-back tool, no re-routing). The data model allows it later.
- Showing the active agent in the web app.
- Persisting tool messages or the routing summary (only the agent name is stored).

## Decisions

### 1. One agent, state-driven configuration (not several `createAgent` instances)
The graph is created once per request with a state field `currentAgent` (zod state schema on the middleware, initial value from the session). `wrapModelCall` looks up `AGENTS[state.currentAgent]` and calls `handler({ ...request, model, systemPrompt, tools })`. All tools (local and MCP) are registered with `createAgent` so the tool node can execute them; the middleware only controls which are *visible* to the model.

Alternatives: run the selector, then build a second agent in `AgentService` (option 1/2 of the exploration) — simpler to read but duplicates the streaming loop, and splitting state across two runs makes later mid-conversation transfers harder. Supervisor/agent-as-tool — extra hop per answer and the user would talk to the supervisor.

### 2. `selectAgent` returns a `Command`
`selectAgent(agentName, confidence, summary)` is a local tool created by the existing factory pattern. On success it returns `new Command({ update: { currentAgent, routingSummary, messages: [ToolMessage] } })`; the agent loop then calls the model again and the middleware now applies the downstream definition. Schema: `agentName` is a zod enum of the downstream names (all `AGENTS` keys except `selector`), `confidence` a number in [0, 1], `summary` a **string** (the original draft typed it as number).

Server-side gate (the prompt alone is not trusted): if `confidence < 0.5` and the selector has not used up its turns, the tool does not switch and returns an error tool result telling the model to ask a clarifying question.

### 3. Turn limit is computed, not counted by the model
The selector stays active until it routes, so every human message in the state belongs to the selector phase. The middleware appends the current turn (`N of 5`) to the selector's system prompt, and at turn 5 states that it must now call `selectAgent`, using `other` if the intent is still unclear. The gate in decision 2 is lifted on that turn. Constant `SELECTOR_MAX_TURNS = 5` lives next to `AGENTS`.

### 4. Persisting the active agent
New column `chat_sessions.agent varchar(64) NOT NULL DEFAULT 'selector'` (migration `1700000000002`). `AgentRunContext` gains `agent`; `AgentService.run` seeds `currentAgent` from it and returns the final `currentAgent`; the controller saves it with the assistant reply (only when it changed). Unknown stored names (a definition removed later) fall back to `selector`. The routing summary is only used within the run that produced it: later requests resume with the stored agent and the full (trimmed) history. The summary is injected into the downstream system prompt for that run as a "Routing summary" paragraph.

Alternative: derive the agent from message history — impossible, tool messages are not stored.

### 5. Definition shape and the review of the draft `AGENTS`
```ts
interface AgentDefinition {
  version: string;                       // hook for later versioned configuration
  model: string;
  maxTokens: number;
  thinking: { type: 'adaptive' };
  outputConfig: { effort: 'low' | 'medium' | ... };
  tools: Array<{ type: 'local'; name: string } | { type: 'mcp'; server: string }>;
  systemPrompt: string;
}
```
`AgentName = keyof typeof AGENTS` (so `selectAgent`'s enum and the DB value are type-checked). Review findings and the corrections:

| Draft | Problem | Change |
|---|---|---|
| `apiKey: process.env.MODEL_BASE_URL`, `apiUrl: process.env.MODEL_API_KEY` | Values swapped | Removed from definitions (next row) |
| `process.env.*` read inside `agent.config.ts` at import time | Bypasses `loadEnv` (the single place env is read, with its dotenv loading and `""`→undefined handling); evaluated before dotenv may have run; breaks the "missing variable" error naming; would put secrets into config that is meant to become editable/versioned | Definitions contain no env values. The model connection is built in `AgentService` from `AppEnv.model`; MCP servers are referenced by *name* and resolved through `AppEnv.mcp.servers` |
| MCP tool `name: 'workOrder'`, `url: process.env.MCP_WORK_ORDER_URL` | Name differs from the existing server key `work_order` (`MCP_SERVER_ENV`), so the tool prefix `work_order_` would not match | `{ type: 'mcp', server: 'work_order' }` using the existing keys |
| Tool entries `{ type: 'backend', function: 'selectAgent' }` | Indirection with no resolver; "backend" is ambiguous | `{ type: 'local', name: 'selectAgent' }`, resolved against the local tool registry |
| Same model/limits repeated 4× | Repetition | Shared defaults spread into each definition; per-agent values stay overridable (selector uses effort `low`: routing needs no deep reasoning) |
| `renameSession` on the selector | The selector's first reply is often a clarifying question and the topic is unknown | Moved to the three downstream agents; their prompts tell them to name the session in their first reply (keeps the existing `renameSession` behaviour) |
| `AGENT_SYSTEM_PROMPT_SELECTOR` joined with `' '` | The blank lines and bullet structure collapse into one paragraph | Join with `'\n'` |
| `other` described as "unclear after 5 turns" only | Greetings, thanks and off-topic questions also belong to `other` | `other` = not a fault report or work-order question, or still unclear after 5 turns |
| Selector prompt tells the model to count turns | Unreliable | Turn number is injected (decision 3) |
| Downstream prompts: `fault_report` reuses the generic prompt, the other two are `You are a helpful assistant.` | Do not use the specialisation | Dedicated prompts (below) |
| Name `work_order_inquiry` (earlier discussion said `ticket_inquiry`) | — | Keep `work_order_inquiry`: it matches the domain term and the MCP server |

Downstream prompts, in outline (shared rules: answer concisely in the user's language; use only tools you have; never invent data a tool should provide; call `renameSession` in your first reply with a title of at most 30 characters):
- `fault_report`: collect what a fault report needs (affected asset or system, location, symptom/error text, since when, impact); look up assets and locations through the MCP tools and check existing work orders for the same fault; summarise the report back to the user. No tool creates work orders, so it must not claim a ticket was created.
- `work_order_inquiry`: read-only; look up a work order by id or filters through the work-order and user tools and report status and details; if nothing matches say so.
- `other`: general helper without business tools; answer small talk and general questions; for questions about faults or work orders, say what it can help with and ask the user to describe the fault or give the work order id (the next message stays with `other`, since re-routing is out of scope).

Tools per agent: selector → `selectAgent`; `fault_report` → `renameSession` + MCP `user`, `location`, `asset`, `work_order`; `work_order_inquiry` → `renameSession` + MCP `user`, `work_order`; `other` → `renameSession`.

### 6. MCP tools grouped by server
`connectMcp` additionally returns `toolsByServer: Record<string, StructuredToolInterface[]>` (it already loads per server) so the middleware filters by server name rather than by a name prefix. Connections are still opened per run and closed in `finally`.

### 7. Model construction
`AgentService` builds one `ChatAnthropic` per agent definition used in the run (lazily, cached for the run) from the definition plus `AppEnv.model`, and the middleware passes it in `request.model`. The "missing `MODEL_BASE_URL` / `MODEL_API_KEY`" checks stay at the top of `run`.

### 8. Visibility of the switch
No new stream event. `selectAgent` appears in the existing `thinking` stream via `foldStep` (`[Tool call] selectAgent {...}` and its result). The recursion limit (10) leaves room: a switch costs two extra graph steps.

## Risks / Trade-offs

- [MCP servers are connected on every request, including selector-only clarification turns] → Accepted: the selector may route within the run, so tools must exist up front. A lazy-connect optimisation (connect when the first MCP tool becomes visible) can follow if latency matters.
- [Mid-run config swap changes tools/system prompt, so Anthropic prompt caching of the prefix is lost after the switch] → Acceptable: the switch happens once per session.
- [The selector may answer in text without ever calling `selectAgent`, leaving the session on `selector`] → The next message is another selector turn; turn 5 forces routing. Prompt keeps clarifying questions to one per turn.
- [`other` is a sink: the user cannot be re-routed after a wrong or fallback choice] → Known limitation of "no re-routing"; the stored agent can be reset to `selector` manually, and a transfer tool is the natural follow-up.
- [Middleware API shape (`request` overrides, state schema, `Command` from a tool) is tied to `langchain@1.5.x`] → Covered by unit tests on the middleware and the tool; verify against the installed version first.
- [A removed agent name stored in the database] → Falls back to `selector`.

## Migration Plan

1. Deploy with the migration (`DB_MIGRATIONS_RUN` or `pnpm migration:run`): existing sessions get `agent = 'selector'` and are routed on their next message.
2. Rollback: revert the code; the extra column is harmless and can be dropped by the migration's `down`.
