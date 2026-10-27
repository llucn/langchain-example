import type { StructuredToolInterface } from '@langchain/core/tools';
import { createMiddleware } from 'langchain';
import { z } from 'zod';
import {
  AGENTS,
  INITIAL_AGENT,
  resolveAgent,
  SELECTOR_MAX_TURNS,
  type AgentName,
  type AgentToolRef,
} from './agent.config';
import { selectorTurn } from './tools/select-agent.tool';

/** Agent state added to the run: who is talking now, and what the selector handed over. */
export const multiAgentState = z.object({
  currentAgent: z.string().default(INITIAL_AGENT),
  routingSummary: z.string().default(''),
});

/** Tools an agent may see: its local tools by name and the tools of the MCP servers it lists. */
export function visibleTools(
  refs: AgentToolRef[],
  local: StructuredToolInterface[],
  mcpByServer: Record<string, StructuredToolInterface[]>,
): StructuredToolInterface[] {
  return refs.flatMap((ref) =>
    ref.type === 'local'
      ? local.filter((t) => t.name === ref.name)
      : (mcpByServer[ref.server] ?? []),
  );
}

/** The agent's system prompt plus what only the running state knows (turn number, routing summary). */
export function composePrompt(agent: AgentName, messages: { type: string }[], summary: string) {
  const base: string = AGENTS[agent].systemPrompt;
  if (agent === 'selector') {
    const turn = selectorTurn(messages as never);
    const last = turn >= SELECTOR_MAX_TURNS;
    return [
      base,
      '',
      `This is user turn ${turn} of at most ${SELECTOR_MAX_TURNS}.` +
        (last
          ? ' This is your last turn: call `selectAgent` now, with `other` if the intent is still unclear.'
          : ''),
    ].join('\n');
  }
  if (!summary) return base;
  // A summary only exists in the run that handed over, i.e. the session's first downstream reply.
  return [
    base,
    '',
    `Routing summary from the selector: ${summary}`,
    "This is your first reply after the hand-over: also call `renameSession` with a short title (at most 30 characters, in the user's language).",
  ].join('\n');
}

/**
 * Applies the current agent's definition before every model call: system prompt, model and the
 * tools it lists. All tools stay registered with the agent so the tool node can run them.
 */
export const createMultiAgentMiddleware = (deps: {
  modelFor: (agent: AgentName) => unknown;
  localTools: StructuredToolInterface[];
  mcpByServer: Record<string, StructuredToolInterface[]>;
}) =>
  createMiddleware({
    name: 'MultiAgent',
    stateSchema: multiAgentState,
    wrapModelCall: (request, handler) => {
      const agent = resolveAgent(request.state.currentAgent);
      return handler({
        ...request,
        model: deps.modelFor(agent) as never,
        systemPrompt: composePrompt(agent, request.messages, request.state.routingSummary ?? ''),
        tools: visibleTools(AGENTS[agent].tools, deps.localTools, deps.mcpByServer),
      });
    },
  });
