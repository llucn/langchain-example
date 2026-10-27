## 1. Data model

- [x] 1.1 Add `agent` (`varchar(64)`, default `'selector'`) to `ChatSession` and a migration `1700000000002` that adds/drops the column
- [x] 1.2 `ChatService`: method to save the session's agent; keep `toSessionDto` unchanged

## 2. Agent definitions

- [x] 2.1 Rewrite `AGENTS` in `agent.config.ts` per design decision 5: `AgentDefinition` type, shared model defaults, no `process.env`, tools as `{type:'local'|'mcp'}`, `AgentName`, `INITIAL_AGENT`, `SELECTOR_MAX_TURNS`
- [x] 2.2 Write the selector prompt (joined with `\n`, `other` semantics, no self-counted turns) and the dedicated `fault_report`, `work_order_inquiry` and `other` prompts including the `renameSession` instruction; remove the old `AGENT_SYSTEM_PROMPT`
- [x] 2.3 Unit test: registry has the four agents, no definition holds an env value, every listed local tool and MCP server name exists

## 3. Tools and MCP

- [x] 3.1 Add `@langchain/langgraph` as a dependency of `@app/api`
- [x] 3.2 `connectMcp` also returns `toolsByServer`; update `mcp.client.spec.ts`
- [x] 3.3 Add `tools/select-agent.tool.ts`: zod schema (`agentName` enum of downstream names, `confidence` 0–1, `summary` string), returns a `Command` updating `currentAgent`, `routingSummary` and the `ToolMessage`; rejects `confidence < 0.5` before the last selector turn; register it in `tools/index.ts`
- [x] 3.4 Unit tests for `selectAgent`: success, unknown agent, low confidence early, low confidence on the fifth turn

## 4. Agent service and middleware

- [x] 4.1 Add the multi-agent middleware (state schema `currentAgent`/`routingSummary`; `wrapModelCall` applies model, system prompt with routing summary and selector turn info, and the visible tools); verify the request-override and `Command` behaviour against `langchain@1.5.19`
- [x] 4.2 `AgentService.run`: take `agent` from `AgentRunContext`, build per-agent models from `AppEnv.model` (cached per run), register all tools, return the final `currentAgent`; unknown agent falls back to `selector`
- [x] 4.3 Update `agent.service.spec.ts` (missing-variable errors, tool visibility per agent, switching within a run with a fake model)

## 5. Chat flow

- [x] 5.1 `ChatController.send`: pass `session.agent` into the run and store the returned agent when it changed
- [ ] 5.2 E2E/integration check: first message routes and is answered in one request; a follow-up starts at the stored agent; a clarifying reply keeps `selector` (covered at graph level by `multi-agent.middleware.spec.ts`; HTTP/DB level not run)

## 6. Wrap-up

- [x] 6.1 Run `pnpm lint`, `pnpm checkstyle` and `pnpm test`
- [x] 6.2 Try it against the running stack with the scenarios from the specs (fault report, work-order inquiry, ambiguous input, small talk) — run with auth off, so MCP tools were not reachable
