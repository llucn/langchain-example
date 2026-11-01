import type { CaseEvent, CaseEvidence, ReviewTag } from '@app/shared';
import { In, LessThan, LessThanOrEqual, type Repository } from 'typeorm';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';

/** Longest text of one event handed to the models; tool results can be large. */
const CLIP = 4000;
/** Events of earlier turns that give the reviewed turn its context. */
const HISTORY_EVENTS = 20;

const clip = (s: string) => (s.length > CLIP ? `${s.slice(0, CLIP)}… [clipped]` : s);

const toEvent = (m: ChatLogMessage): CaseEvent => ({
  seq: m.seq,
  type: m.type,
  agentName: m.agentName,
  content: clip(m.content),
  toolName: m.toolName,
  toolCallId: m.toolCallId,
  toolCalls: m.toolCalls,
  status: m.status,
});

export interface BuiltCase {
  evidence: CaseEvidence;
  /** The config the event ran under is unknown, so the case cannot be diagnosed. */
  insufficient: boolean;
}

/**
 * Builds the evidence of a Bad message review without a model: the reviewed turn up to the
 * reviewed event, the final answers and user inputs before it, the review text and the config
 * snapshot (definition and settings) of the commit the event ran under.
 */
export class CaseBuilder {
  constructor(
    private readonly messages: Pick<Repository<ChatLogMessage>, 'findOneBy' | 'find'>,
    private readonly snapshots: Pick<Repository<AgentConfigSnapshot>, 'findOneBy'>,
  ) {}

  async build(review: ChatLogReview, message: ChatLogMessage): Promise<BuiltCase> {
    const turn = await this.messages.find({
      where: {
        sessionId: message.sessionId,
        turnId: message.turnId,
        seq: LessThanOrEqual(message.seq),
      },
      order: { seq: 'ASC' },
    });
    const firstSeq = turn[0]?.seq ?? message.seq;
    const earlier = await this.messages.find({
      where: {
        sessionId: message.sessionId,
        seq: LessThan(firstSeq),
        type: In(['user_input', 'llm_end_turn']),
      },
      order: { seq: 'DESC' },
      take: HISTORY_EVENTS,
    });

    const agentName = message.agentName ?? 'unknown';
    const snapshot = message.agentConfigHash
      ? await this.snapshots.findOneBy({ hash: message.agentConfigHash, agentName })
      : null;

    return {
      insufficient: !snapshot,
      evidence: {
        reviewedSeq: message.seq,
        agentName,
        configHash: message.agentConfigHash,
        configVersion: message.agentConfigVersion,
        definition: snapshot?.definition ?? null,
        settings: snapshot
          ? ((snapshot.settings as { settings?: Record<string, unknown> }).settings ?? null)
          : null,
        review: {
          tags: review.tags as ReviewTag[],
          comment: review.comment,
          expectedResult: review.expectedResult,
          reviewerName: review.reviewerName,
        },
        history: earlier
          .reverse()
          .map((m) => ({ seq: m.seq, type: m.type, content: clip(m.content) })),
        turn: turn.map(toEvent),
      },
    };
  }
}
