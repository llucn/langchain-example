import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ChatLogMessage as ChatLogMessageDto,
  ChatLogReview as ChatLogReviewDto,
  ChatLogSession as ChatLogSessionDto,
  ChatLogSessionDetail,
  ChatLogSessionPage,
  ReviewTag,
} from '@app/shared';
import { DataSource, Repository } from 'typeorm';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { ChatLogSession } from '../database/entities/chat-log-session.entity';
import type { ListSessionsQueryDto, SaveReviewDto } from './chat-log-review.dto';

/** What a review is about: a whole session or one of its message events. */
export type ReviewTarget = { kind: 'session' | 'message'; id: string };

export interface Reviewer {
  sub: string;
  name: string | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const toMessageDto = (m: ChatLogMessage): ChatLogMessageDto => ({
  id: m.id,
  sessionId: m.sessionId,
  seq: m.seq,
  turnId: m.turnId,
  type: m.type,
  userSub: m.userSub,
  agentName: m.agentName,
  agentConfigVersion: m.agentConfigVersion,
  agentConfigHash: m.agentConfigHash,
  appVersion: m.appVersion,
  model: m.model,
  content: m.content,
  truncated: m.truncated,
  thinking: m.thinking,
  toolCalls: m.toolCalls,
  toolName: m.toolName,
  toolCallId: m.toolCallId,
  status: m.status,
  errorMessage: m.errorMessage,
  startedAt: iso(m.startedAt),
  createdAt: m.createdAt.toISOString(),
  durationMs: m.durationMs,
  chatMessageId: m.chatMessageId,
  metadata: m.metadata,
});

export const toReviewDto = (r: ChatLogReview): ChatLogReviewDto => ({
  id: r.id,
  sessionId: r.sessionId,
  messageId: r.messageId,
  rating: r.rating,
  tags: r.tags as ReviewTag[],
  comment: r.comment,
  expectedResult: r.expectedResult,
  difference: r.difference,
  reviewerType: r.reviewerType,
  reviewerSub: r.reviewerSub,
  reviewerName: r.reviewerName,
  evaluator: r.evaluator,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** WHERE conditions and parameters of the session list filters. */
export function buildSessionFilter(q: ListSessionsQueryDto): { where: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conds.push(sql.replace('?', `$${params.length}`));
  };
  const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

  if (q.user) {
    params.push(`%${escapeLike(q.user)}%`);
    const n = `$${params.length}`;
    conds.push(`(s."userSub" ILIKE ${n} OR s."userName" ILIKE ${n})`);
  }
  if (q.agent) {
    add(
      `EXISTS (SELECT 1 FROM chat_log_messages m WHERE m."sessionId" = s.id AND m."agentName" = ?)`,
      q.agent,
    );
  }
  if (q.appVersion) add(`s."appVersion" = ?`, q.appVersion);
  if (q.from) add(`s."startedAt" >= ?`, q.from);
  if (q.to) add(`s."startedAt" <= ?`, q.to);
  if (q.rating === 'unreviewed') {
    conds.push(`NOT EXISTS (SELECT 1 FROM chat_log_reviews r WHERE r."sessionId" = s.id)`);
  } else if (q.rating) {
    add(
      `EXISTS (SELECT 1 FROM chat_log_reviews r WHERE r."sessionId" = s.id AND r.rating = ?)`,
      q.rating,
    );
  }
  return { where: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

@Injectable()
export class ChatLogReviewService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ChatLogSession) private readonly sessions: Repository<ChatLogSession>,
    @InjectRepository(ChatLogMessage) private readonly messages: Repository<ChatLogMessage>,
    @InjectRepository(ChatLogReview) private readonly reviews: Repository<ChatLogReview>,
  ) {}

  private static readonly SESSION_SELECT = `
    SELECT s.id, s."userSub", s."userName", s."appVersion", s."startedAt", s.name, s."deletedAt",
      s."messageCount" AS "eventCount",
      (SELECT max(m."createdAt") FROM chat_log_messages m WHERE m."sessionId" = s.id) AS "lastEventAt",
      COALESCE((SELECT array_agg(DISTINCT m."agentName" ORDER BY m."agentName") FROM chat_log_messages m
        WHERE m."sessionId" = s.id AND m."agentName" IS NOT NULL), '{}') AS agents,
      (SELECT count(*)::int FROM chat_log_reviews r WHERE r."sessionId" = s.id AND r.rating = 'good') AS "goodCount",
      (SELECT count(*)::int FROM chat_log_reviews r WHERE r."sessionId" = s.id AND r.rating = 'bad') AS "badCount"
    FROM chat_log_sessions s`;

  private static toSessionDto(row: Record<string, unknown>): ChatLogSessionDto {
    const date = (v: unknown) => (v ? new Date(v as string | Date).toISOString() : null);
    return {
      id: row.id as string,
      userSub: (row.userSub as string | null) ?? null,
      userName: (row.userName as string | null) ?? null,
      appVersion: row.appVersion as string,
      startedAt: date(row.startedAt) as string,
      name: (row.name as string | null) ?? null,
      deletedAt: date(row.deletedAt),
      eventCount: Number(row.eventCount),
      lastEventAt: date(row.lastEventAt),
      agents: (row.agents as string[]) ?? [],
      goodCount: Number(row.goodCount),
      badCount: Number(row.badCount),
    };
  }

  async listSessions(q: ListSessionsQueryDto): Promise<ChatLogSessionPage> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const { where, params } = buildSessionFilter(q);
    const rows = await this.dataSource.query(
      `${ChatLogReviewService.SESSION_SELECT} ${where} ORDER BY s."startedAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    const [{ count }] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM chat_log_sessions s ${where}`,
      params,
    );
    return {
      items: rows.map(ChatLogReviewService.toSessionDto),
      total: count as number,
      page,
      pageSize,
    };
  }

  async getSession(id: string): Promise<ChatLogSessionDetail> {
    const [row] = await this.dataSource.query(
      `${ChatLogReviewService.SESSION_SELECT} WHERE s.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Chat log session not found');
    const [messages, reviews] = await Promise.all([
      this.messages.find({ where: { sessionId: id }, order: { seq: 'ASC' } }),
      this.reviews.find({ where: { sessionId: id }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      session: ChatLogReviewService.toSessionDto(row),
      messages: messages.map(toMessageDto),
      reviews: reviews.map(toReviewDto),
    };
  }

  /** Creates or updates the reviewer's review of a session or one of its message events. */
  async saveReview(
    target: ReviewTarget,
    dto: SaveReviewDto,
    reviewer: Reviewer,
  ): Promise<ChatLogReviewDto> {
    if (target.kind === 'session' && (dto.expectedResult || dto.difference)) {
      throw new BadRequestException('expectedResult and difference only apply to message reviews');
    }
    let sessionId = target.id;
    if (target.kind === 'message') {
      const message = await this.messages.findOneBy({ id: target.id });
      if (!message) throw new NotFoundException('Chat log message not found');
      sessionId = message.sessionId;
    } else if (!(await this.sessions.existsBy({ id: target.id }))) {
      throw new NotFoundException('Chat log session not found');
    }

    const fields = {
      rating: dto.rating,
      tags: dto.tags ?? [],
      comment: dto.comment?.trim() || null,
      expectedResult: dto.expectedResult?.trim() || null,
      difference: dto.difference?.trim() || null,
      reviewerName: reviewer.name,
    };
    const existing = await this.findOwn(target, reviewer);
    if (existing) return toReviewDto(await this.reviews.save(Object.assign(existing, fields)));
    return toReviewDto(
      await this.reviews.save(
        this.reviews.create({
          ...fields,
          sessionId,
          messageId: target.kind === 'message' ? target.id : null,
          reviewerType: 'human',
          reviewerSub: reviewer.sub,
        }),
      ),
    );
  }

  async deleteReview(target: ReviewTarget, reviewer: Reviewer): Promise<void> {
    const existing = await this.findOwn(target, reviewer);
    if (!existing) throw new NotFoundException('Review not found');
    await this.reviews.delete(existing.id);
  }

  private findOwn(target: ReviewTarget, reviewer: Reviewer) {
    return this.reviews
      .createQueryBuilder('r')
      .where(`r."reviewerSub" = :sub AND r."reviewerType" = 'human'`, { sub: reviewer.sub })
      .andWhere(
        target.kind === 'session'
          ? 'r."sessionId" = :id AND r."messageId" IS NULL'
          : 'r."messageId" = :id',
        { id: target.id },
      )
      .getOne();
  }
}
