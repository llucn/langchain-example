import { ChatAnthropic } from '@langchain/anthropic';
import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
  type ToolMessage,
} from '@langchain/core/messages';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createAgent } from 'langchain';
import { Repository } from 'typeorm';
import { APP_ENV, type AppEnv } from '../config/env';
import { ChatSession } from '../database/entities/chat-session.entity';
import { User } from '../database/entities/user.entity';
import {
  AGENT_MAX_CONTEXT_MESSAGES,
  AGENT_RECURSION_LIMIT,
  AGENTS,
  resolveAgent,
  type AgentName,
} from './agent.config';
import type { AgentRunContext } from './agent.context';
import { TimingHandler, type AgentRunLog } from './agent.log';
import { connectMcp } from './mcp/mcp.client';
import { createMultiAgentMiddleware } from './multi-agent.middleware';
import { buildTools } from './tools';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const text = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .filter((b) => b?.type === 'text')
          .map((b) => b.text)
          .join('')
      : '';

/** Reasoning blocks of a Claude message (extended thinking). */
const reasoning = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .filter((b) => b?.type === 'thinking')
        .map((b) => b.thinking)
        .join('')
    : '';

/** Keeps the most recent messages that fit the fixed context limit. */
export const trimHistory = (history: HistoryMessage[]) =>
  history.slice(-AGENT_MAX_CONTEXT_MESSAGES);

interface StepState {
  messages?: BaseMessage[];
  currentAgent?: string;
  routingSummary?: string;
}

/** Turns one graph step (model or tools node) into thinking chunks and, for a final reply, the answer. */
export function foldStep(
  node: string,
  messages: BaseMessage[],
): { chunks: string[]; answer?: string } {
  const chunks: string[] = [];
  let answer: string | undefined;
  for (const msg of messages) {
    if (node === 'tools') {
      chunks.push(`[Tool result] ${(msg as ToolMessage).name} ${text(msg.content)}`);
      continue;
    }
    const r = reasoning(msg.content).trim();
    if (r) chunks.push(r);
    const calls = (msg as AIMessage).tool_calls ?? [];
    for (const call of calls) chunks.push(`[Tool call] ${call.name} ${JSON.stringify(call.args)}`);
    if (!calls.length) answer = text(msg.content);
  }
  return { chunks, answer };
}

interface LogStepContext {
  timing: TimingHandler;
  /** Tool name -> `local` or the MCP server it comes from. */
  toolSource: Map<string, string>;
  /** User turns the selector has seen (the history's user messages). */
  selectorTurn: number;
  routingSummary: string;
}

/** Reports one graph step to the chat log: a model reply, or the tool results of a tools node. */
export function logStep(
  log: AgentRunLog,
  node: string,
  agent: AgentName,
  messages: BaseMessage[],
  ctx: LogStepContext,
): void {
  for (const msg of messages) {
    if (node === 'tools') {
      const tool = msg as ToolMessage;
      const timing = ctx.timing.takeTool(tool.tool_call_id);
      log.onToolResult({
        agent,
        toolName: tool.name ?? '',
        toolCallId: tool.tool_call_id,
        content: text(tool.content),
        status: tool.status === 'error' ? 'error' : 'ok',
        startedAt: timing?.startedAt ?? null,
        durationMs: timing?.durationMs ?? null,
        metadata: { toolSource: ctx.toolSource.get(tool.name ?? '') ?? null },
      });
      continue;
    }
    const ai = msg as AIMessage;
    const timing = ctx.timing.takeLlm();
    const meta = (ai.response_metadata ?? {}) as Record<string, unknown>;
    log.onLlm({
      agent,
      content: text(ai.content),
      thinking: reasoning(ai.content).trim() || null,
      toolCalls: (ai.tool_calls ?? []).map((c) => ({ id: c.id ?? '', name: c.name, args: c.args })),
      model: typeof meta.model === 'string' ? meta.model : AGENTS[agent].model,
      startedAt: timing?.startedAt ?? null,
      durationMs: timing?.durationMs ?? null,
      metadata: {
        usage: ai.usage_metadata ?? null,
        stopReason: meta.stop_reason ?? meta.stopReason ?? null,
        ...(agent === 'selector'
          ? { selectorTurn: ctx.selectorTurn }
          : ctx.routingSummary
            ? { routingSummary: ctx.routingSummary }
            : {}),
      },
    });
  }
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ChatSession) private readonly sessions: Repository<ChatSession>,
  ) {}

  /**
   * Runs the agent over the history (last item = new user message). Reasoning, tool calls and tool
   * results are reported through `onThinking` as they happen; resolves with the final answer.
   */
  async run(
    history: HistoryMessage[],
    ctx: AgentRunContext,
    onThinking: (delta: string) => void | Promise<void>,
  ): Promise<{ answer: string; thinking: string; agent: AgentName }> {
    const { baseUrl, apiKey } = this.env.model;
    if (!baseUrl) throw new Error('MODEL_BASE_URL is not set');
    if (!apiKey) throw new Error('MODEL_API_KEY is not set');

    const mcp = await connectMcp(this.env.mcp.servers, ctx.idToken);
    try {
      const models = new Map<AgentName, ChatAnthropic>();
      const modelFor = (name: AgentName) => {
        let model = models.get(name);
        if (!model) {
          const def = AGENTS[name];
          model = new ChatAnthropic({
            model: def.model,
            apiKey,
            anthropicApiUrl: baseUrl,
            maxTokens: def.maxTokens,
            thinking: def.thinking,
            outputConfig: def.outputConfig,
          });
          models.set(name, model);
        }
        return model;
      };

      const localTools = buildTools({ ...ctx, users: this.users, sessions: this.sessions });
      let current = resolveAgent(ctx.agent);
      const agent = createAgent({
        model: modelFor(current),
        tools: [...localTools, ...mcp.tools],
        middleware: [
          createMultiAgentMiddleware({ modelFor, localTools, mcpByServer: mcp.toolsByServer }),
        ],
      });

      const messages: BaseMessage[] = trimHistory(history).map((m) =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
      );

      let thinking = '';
      let answer = '';
      const emit = async (chunk: string) => {
        const delta = thinking ? `\n${chunk}` : chunk;
        thinking += delta;
        await onThinking(delta);
      };

      const logCtx: LogStepContext = {
        timing: new TimingHandler(),
        toolSource: new Map([
          ...localTools.map((t) => [t.name, 'local'] as const),
          ...Object.entries(mcp.toolsByServer).flatMap(([server, tools]) =>
            tools.map((t) => [t.name, server] as const),
          ),
        ]),
        selectorTurn: messages.filter((m) => m.type === 'human').length,
        routingSummary: '',
      };

      const stream = await agent.stream(
        { messages, currentAgent: current },
        {
          streamMode: 'updates',
          recursionLimit: AGENT_RECURSION_LIMIT,
          callbacks: [logCtx.timing],
        },
      );
      for await (const update of stream) {
        for (const [node, state] of Object.entries(update as Record<string, StepState>)) {
          // The agent that produced this step: a hand-over in `state` applies to the next one.
          const producer = current;
          if (state?.currentAgent) current = resolveAgent(state.currentAgent);
          const step = foldStep(node, state?.messages ?? []);
          if (ctx.log) {
            try {
              logStep(ctx.log, node, producer, state?.messages ?? [], logCtx);
            } catch (err) {
              this.logger.error(err);
            }
          }
          if (typeof state?.routingSummary === 'string')
            logCtx.routingSummary = state.routingSummary;
          for (const chunk of step.chunks) await emit(chunk);
          if (step.answer !== undefined) answer = step.answer;
        }
      }
      return { answer, thinking, agent: current };
    } finally {
      await mcp.close();
    }
  }
}
