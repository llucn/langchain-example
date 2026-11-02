import type { ReplayCall, ReplayOutput } from '@app/shared';
import type { Repository } from 'typeorm';
import type { AgentConfigService } from '../../agent-config/agent-config.service';
import type { AgentRunLog } from '../../agent/agent.log';
import type { AgentRunContext } from '../../agent/agent.context';
import { AgentService, type HistoryMessage } from '../../agent/agent.service';
import type { AppEnv } from '../../config/env';
import type { ChatSession } from '../../database/entities/chat-session.entity';
import type { User } from '../../database/entities/user.entity';
import type { MemoryService } from '../../memory/memory.service';
import { memoriesFromTexts } from '../../agent/memory-prompt';
import type { ToolInfo } from '../tool-inventory';
import { canonicalJson, createRecordedMcp, type RecordedResult } from './recorded-mcp';

export interface ReplayInput {
  /** The config to run under (the one the event ran under, or the proposed one). */
  config: AgentConfigService;
  entryAgent: string;
  /** Last item is the user message of the replayed turn. */
  history: HistoryMessage[];
  recorded: RecordedResult[];
  /** The MCP tools to offer, from the proposal's tool inventory. */
  inventory: ToolInfo[];
  /** Texts of the memories the original run had in its prompt (from the chat log). */
  memories?: string[];
}

/** Runs the agent graph; replaceable in tests. */
export type ReplayRunner = (
  config: AgentConfigService,
  history: HistoryMessage[],
  ctx: AgentRunContext,
) => Promise<{ answer: string; agent: string }>;

/** Stands in for the memory store: reads nothing, and `saveMemory` / `forgetMemory` only pretend. */
export const noMemory = {
  recent: async () => [],
  save: async (_owner: unknown, content: string) => ({
    memory: { id: 'replay000', content },
    created: true,
  }),
  findByRef: async (_owner: unknown, id: string) => ({ id, content: '' }),
  remove: async () => undefined,
} as unknown as MemoryService;

/**
 * Replay uses a normal `AgentService` over the given config, with two stand-ins: the repository
 * `renameSession` writes to only records, the memory service is one that stores nothing, and the
 * MCP connection is the recorded one. Nothing of a replay is stored.
 */
export const agentRunner =
  (env: AppEnv): ReplayRunner =>
  (config, history, ctx) => {
    const sessions = {
      update: async () => ({ affected: 0 }),
    } as unknown as Repository<ChatSession>;
    const service = new AgentService(env, {} as Repository<User>, sessions, config, noMemory);
    return service.run(history, ctx, () => undefined);
  };

/** Replays one turn and reports the final answer and every tool call it made. */
export async function replayTurn(run: ReplayRunner, input: ReplayInput): Promise<ReplayOutput> {
  const recorded = createRecordedMcp(input.inventory, input.recorded);
  const made: { name: string; args: unknown }[] = [];
  const log: AgentRunLog = {
    onLlm: (e) => made.push(...e.toolCalls.map((c) => ({ name: c.name, args: c.args }))),
    onToolResult: () => undefined,
  };
  const result = await run(input.config, input.history, {
    sessionId: 'replay',
    agent: input.entryAgent,
    mcp: recorded.connection,
    memories: memoriesFromTexts(input.memories ?? []),
    log,
  });

  // An MCP call without a recorded result shows up in `recorded.calls` as unrecorded; match it
  // to the model's call by tool name and arguments.
  const unrecorded = recorded.calls
    .filter((c) => c.unrecorded)
    .map((c) => `${c.name}${canonicalJson(c.args)}`);
  const toolCalls: ReplayCall[] = made.map((c) => {
    const key = `${c.name}${canonicalJson(c.args)}`;
    const at = unrecorded.indexOf(key);
    if (at >= 0) unrecorded.splice(at, 1);
    return { name: c.name, args: c.args, unrecorded: at >= 0 };
  });
  return { text: result.answer, agent: result.agent, toolCalls };
}

/** The memory texts the turn's run had in its prompt, as the first model event of the turn logged them. */
export function memoriesFor(
  events: { seq: number; turnId: string; metadata?: Record<string, unknown> | null }[],
  turnId: string,
): string[] {
  const turn = events.filter((e) => e.turnId === turnId).sort((a, b) => a.seq - b.seq);
  for (const e of turn) {
    const memories = e.metadata?.memories;
    if (Array.isArray(memories)) return memories.filter((m): m is string => typeof m === 'string');
  }
  return [];
}

interface HistoryEvent {
  seq: number;
  turnId: string;
  type: string;
  content: string;
}

/**
 * The conversation up to and including the user message of the turn: earlier user inputs and
 * final answers from the log (not regenerated), then the turn's own user message.
 */
export function historyFor(events: HistoryEvent[], turnId: string): HistoryMessage[] {
  const turn = events.filter((e) => e.turnId === turnId).sort((a, b) => a.seq - b.seq);
  const first = turn[0]?.seq ?? Number.POSITIVE_INFINITY;
  const userMessage = turn.find((e) => e.type === 'user_input');
  const before = events
    .filter((e) => e.seq < first && (e.type === 'user_input' || e.type === 'llm_end_turn'))
    .sort((a, b) => a.seq - b.seq)
    .map((e): HistoryMessage => ({
      role: e.type === 'user_input' ? 'user' : 'assistant',
      content: e.content,
    }));
  return userMessage ? [...before, { role: 'user', content: userMessage.content }] : before;
}
