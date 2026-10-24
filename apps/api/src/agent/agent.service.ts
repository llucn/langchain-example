import { ChatAnthropic } from '@langchain/anthropic';
import {
  AIMessage,
  HumanMessage,
  type BaseMessage,
  type ToolMessage,
} from '@langchain/core/messages';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createAgent } from 'langchain';
import { Repository } from 'typeorm';
import { APP_ENV, type AppEnv } from '../config/env';
import { User } from '../database/entities/user.entity';
import {
  AGENT_MAX_CONTEXT_MESSAGES,
  AGENT_MAX_TOKENS,
  AGENT_MODEL,
  AGENT_RECURSION_LIMIT,
  AGENT_SYSTEM_PROMPT,
  AGENT_THINKING_EFFORT,
} from './agent.config';
import { createGetUsersTool } from './tools/get-users.tool';
import { sendMail } from './tools/send-mail.tool';
import { getWeather } from './tools/get-weather.tool';

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

@Injectable()
export class AgentService {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * Runs the agent over the history (last item = new user message). Reasoning, tool calls and tool
   * results are reported through `onThinking` as they happen; resolves with the final answer.
   */
  async run(
    history: HistoryMessage[],
    onThinking: (delta: string) => void | Promise<void>,
  ): Promise<{ answer: string; thinking: string }> {
    const { baseUrl, apiKey } = this.env.model;
    if (!baseUrl) throw new Error('MODEL_BASE_URL is not set');
    if (!apiKey) throw new Error('MODEL_API_KEY is not set');

    const agent = createAgent({
      model: new ChatAnthropic({
        model: AGENT_MODEL,
        apiKey,
        anthropicApiUrl: baseUrl,
        maxTokens: AGENT_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        outputConfig: { effort: AGENT_THINKING_EFFORT },
      }),
      tools: [getWeather, createGetUsersTool(this.users), sendMail],
      systemPrompt: AGENT_SYSTEM_PROMPT,
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

    const stream = await agent.stream(
      { messages },
      { streamMode: 'updates', recursionLimit: AGENT_RECURSION_LIMIT },
    );
    for await (const update of stream) {
      for (const [node, state] of Object.entries(update as Record<string, StepState>)) {
        const step = foldStep(node, state?.messages ?? []);
        for (const chunk of step.chunks) await emit(chunk);
        if (step.answer !== undefined) answer = step.answer;
      }
    }
    return { answer, thinking };
  }
}
