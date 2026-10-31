import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { ChatLogToolCall } from '@app/shared';
import type { AgentName } from './agent.config';

/** A model reply of a run (with or without tool calls). */
export interface LlmLogEvent {
  agent: AgentName;
  content: string;
  thinking: string | null;
  toolCalls: ChatLogToolCall[];
  model: string | null;
  startedAt: Date | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

/** The result a tool returned to the agent. */
export interface ToolResultLogEvent {
  agent: AgentName;
  toolName: string;
  toolCallId: string;
  content: string;
  status: 'ok' | 'error';
  startedAt: Date | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
}

/** Receives what `AgentService.run` observes; implemented by the chat log. Must not throw. */
export interface AgentRunLog {
  onLlm(event: LlmLogEvent): void;
  onToolResult(event: ToolResultLogEvent): void;
}

export interface Timing {
  startedAt: Date;
  durationMs: number;
}

/**
 * Measures model calls and tool executions. Model calls are sequential, so their timings are
 * queued in order and taken by the matching model step; tools may run in parallel and are keyed
 * by tool call id. Handlers are awaited so a timing is always there when the step is folded.
 */
export class TimingHandler extends BaseCallbackHandler {
  name = 'chat-log-timing';
  awaitHandlers = true;

  private readonly started = new Map<string, number>();
  private readonly llmQueue: Timing[] = [];
  private readonly tools = new Map<string, Timing>();
  private readonly toolRuns = new Map<string, string>();

  private begin(runId: string) {
    this.started.set(runId, Date.now());
  }

  private end(runId: string): Timing | undefined {
    const start = this.started.get(runId);
    this.started.delete(runId);
    return start === undefined
      ? undefined
      : { startedAt: new Date(start), durationMs: Date.now() - start };
  }

  handleChatModelStart(_llm: unknown, _messages: unknown, runId: string) {
    this.begin(runId);
  }

  handleLLMEnd(_output: LLMResult, runId: string) {
    const t = this.end(runId);
    if (t) this.llmQueue.push(t);
  }

  handleLLMError(_err: Error, runId: string) {
    const t = this.end(runId);
    if (t) this.llmQueue.push(t);
  }

  handleToolStart(
    _tool: unknown,
    _input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string,
    toolCallId?: string,
  ) {
    this.begin(runId);
    if (toolCallId) this.toolRuns.set(runId, toolCallId);
  }

  private toolDone(runId: string) {
    const t = this.end(runId);
    const id = this.toolRuns.get(runId);
    this.toolRuns.delete(runId);
    if (t && id) this.tools.set(id, t);
  }

  handleToolEnd(_output: unknown, runId: string) {
    this.toolDone(runId);
  }

  handleToolError(_err: Error, runId: string) {
    this.toolDone(runId);
  }

  /** Timing of the oldest model call not yet claimed by a model step. */
  takeLlm(): Timing | undefined {
    return this.llmQueue.shift();
  }

  takeTool(toolCallId: string): Timing | undefined {
    const t = this.tools.get(toolCallId);
    this.tools.delete(toolCallId);
    return t;
  }
}
