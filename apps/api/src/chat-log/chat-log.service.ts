import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ChatLogMessageType } from '@app/shared';
import { Repository } from 'typeorm';
import { resolveAgent } from '../agent/agent.config';
import { agentConfigIdentity } from '../agent/agent.config-identity';
import type { AgentRunLog, LlmLogEvent, ToolResultLogEvent } from '../agent/agent.log';
import { APP_ENV, type AppEnv } from '../config/env';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogSession } from '../database/entities/chat-log-session.entity';

/** Maximum stored characters of one content / reasoning field. */
export const LOG_FIELD_CAP = 64 * 1024;

export interface LogUser {
  sub: string | null;
  name: string | null;
}

/** The user of a request as the log records them; empty when authentication is disabled. */
export const logUserOf = (user: Record<string, unknown> | undefined): LogUser => ({
  sub: (user?.sub as string | undefined) ?? null,
  name:
    ((user?.email ?? user?.['cognito:username'] ?? user?.username) as string | undefined) ?? null,
});

export const cap = (value: string): { value: string; truncated: boolean } =>
  value.length > LOG_FIELD_CAP
    ? { value: value.slice(0, LOG_FIELD_CAP), truncated: true }
    : { value, truncated: false };

type EventFields = Partial<
  Pick<
    ChatLogMessage,
    | 'agentName'
    | 'model'
    | 'content'
    | 'thinking'
    | 'toolCalls'
    | 'toolName'
    | 'toolCallId'
    | 'status'
    | 'errorMessage'
    | 'startedAt'
    | 'durationMs'
    | 'chatMessageId'
    | 'metadata'
  >
> & { type: ChatLogMessageType };

/**
 * Writes the chat log. Every method is best-effort: a failing write is reported in the
 * application log and never reaches the chat (see the chat-logging spec).
 */
@Injectable()
export class ChatLogService {
  private readonly logger = new Logger(ChatLogService.name);
  private readonly knownConfigs = new Set<string>();

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @InjectRepository(ChatLogSession) private readonly sessions: Repository<ChatLogSession>,
    @InjectRepository(ChatLogMessage) private readonly messages: Repository<ChatLogMessage>,
    @InjectRepository(AgentConfigSnapshot)
    private readonly snapshots: Repository<AgentConfigSnapshot>,
  ) {}

  private async safe(what: string, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Chat log: ${what} failed: ${(err as Error).message}`);
    }
  }

  /** Creates the session's log record unless it exists (older sessions get one on their next message). */
  recordSession(
    session: { id: string; startedAt: Date; name: string | null },
    user: LogUser,
  ): Promise<void> {
    return this.safe('session', async () => {
      await this.sessions
        .createQueryBuilder()
        .insert()
        .values({
          id: session.id,
          userSub: user.sub,
          userName: user.name,
          appVersion: this.env.app.version,
          startedAt: session.startedAt,
          name: session.name,
        })
        .orIgnore()
        .execute();
    });
  }

  touchName(sessionId: string, name: string | null): Promise<void> {
    return this.safe('session name', () => this.sessions.update(sessionId, { name }));
  }

  markDeleted(sessionId: string): Promise<void> {
    return this.safe('session deletion', () =>
      this.sessions.update(sessionId, { deletedAt: new Date() }),
    );
  }

  startRun(
    session: { id: string; startedAt: Date; name: string | null },
    user: LogUser,
    agent: string | undefined,
  ): ChatLogRun {
    return new ChatLogRun(this, session, user, resolveAgent(agent));
  }

  /** Stores the definition the agent ran with, once per process and hash. */
  private async ensureConfig(agentName: string): Promise<{ version: string; hash: string }> {
    const identity = agentConfigIdentity(resolveAgent(agentName));
    if (!this.knownConfigs.has(identity.hash)) {
      await this.snapshots
        .createQueryBuilder()
        .insert()
        .values({
          hash: identity.hash,
          agentName: identity.agentName,
          version: identity.version,
          definition: identity.definition as never, // jsonb: TypeORM's deep-partial type rejects `unknown`
        })
        .orIgnore()
        .execute();
      this.knownConfigs.add(identity.hash);
    }
    return identity;
  }

  /** Appends one event; `seq` is allocated atomically on the session row. */
  async writeEvent(
    sessionId: string,
    user: LogUser,
    turnId: string,
    ev: EventFields,
  ): Promise<void> {
    await this.safe(`event ${ev.type}`, async () => {
      const config = ev.agentName ? await this.ensureConfig(ev.agentName) : null;
      const bumped = await this.sessions
        .createQueryBuilder()
        .update()
        .set({ messageCount: () => '"messageCount" + 1' })
        .where('id = :sessionId', { sessionId })
        .returning('"messageCount"')
        .execute();
      const seq = bumped.raw?.[0]?.messageCount as number | undefined;
      if (seq === undefined) throw new Error(`no log session ${sessionId}`);

      const content = cap(ev.content ?? '');
      const thinking = ev.thinking ? cap(ev.thinking) : null;
      // jsonb columns (toolCalls, metadata) do not fit TypeORM's deep-partial insert type.
      await this.messages.insert({
        sessionId,
        seq,
        turnId,
        userSub: user.sub,
        appVersion: this.env.app.version,
        agentConfigVersion: config?.version ?? null,
        agentConfigHash: config?.hash ?? null,
        agentName: null,
        model: null,
        thinking: null,
        toolCalls: null,
        toolName: null,
        toolCallId: null,
        status: 'ok',
        errorMessage: null,
        startedAt: null,
        durationMs: null,
        chatMessageId: null,
        metadata: {},
        ...ev,
        content: content.value,
        truncated: content.truncated || Boolean(thinking?.truncated),
        ...(thinking ? { thinking: thinking.value } : {}),
      } as never);
    });
  }

  linkAnswer(sessionId: string, turnId: string, chatMessageId: string): Promise<void> {
    return this.safe('answer link', () =>
      this.messages.update({ sessionId, turnId, type: 'llm_end_turn' }, { chatMessageId }),
    );
  }
}

/**
 * The log of one chat run (one user message). Events are queued and written in order off the
 * response path; `flush` waits for the queue.
 */
export class ChatLogRun implements AgentRunLog {
  readonly turnId = randomUUID();
  private chain: Promise<void>;

  constructor(
    private readonly service: ChatLogService,
    private readonly session: { id: string; startedAt: Date; name: string | null },
    private readonly user: LogUser,
    private readonly initialAgent: string,
  ) {
    this.chain = this.service.recordSession(session, user);
  }

  private enqueue(ev: EventFields) {
    this.chain = this.chain.then(() =>
      this.service.writeEvent(this.session.id, this.user, this.turnId, ev),
    );
  }

  userInput(content: string, chatMessageId: string) {
    this.enqueue({ type: 'user_input', agentName: this.initialAgent, content, chatMessageId });
  }

  onLlm(e: LlmLogEvent) {
    this.enqueue({
      type: e.toolCalls.length ? 'llm_tool_use' : 'llm_end_turn',
      agentName: e.agent,
      model: e.model,
      content: e.content,
      thinking: e.thinking,
      toolCalls: e.toolCalls.length ? e.toolCalls : null,
      startedAt: e.startedAt,
      durationMs: e.durationMs,
      metadata: e.metadata,
    });
  }

  onToolResult(e: ToolResultLogEvent) {
    this.enqueue({
      type: 'agent_tool_result',
      agentName: e.agent,
      toolName: e.toolName,
      toolCallId: e.toolCallId,
      content: e.content,
      status: e.status,
      errorMessage: e.status === 'error' ? e.content : null,
      startedAt: e.startedAt,
      durationMs: e.durationMs,
      metadata: e.metadata,
    });
  }

  error(message: string, agent: string) {
    this.enqueue({
      type: 'run_error',
      agentName: agent,
      content: message,
      status: 'error',
      errorMessage: message,
    });
  }

  /** Links the final answer's log event to the stored assistant chat message. */
  linkAnswer(chatMessageId: string) {
    this.chain = this.chain.then(() =>
      this.service.linkAnswer(this.session.id, this.turnId, chatMessageId),
    );
  }

  flush(): Promise<void> {
    return this.chain;
  }
}
