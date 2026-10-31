import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { ReviewRating } from '@app/shared';
import { ChatLogMessage } from './chat-log-message.entity';
import { ChatLogSession } from './chat-log-session.entity';

/**
 * A judgement of a logged session (`messageId` null) or message. Kept apart from the log so the
 * log stays immutable and several reviewers, later also an LLM, can review the same target.
 */
@Entity('chat_log_reviews')
@Index(['sessionId', 'reviewerSub'], {
  unique: true,
  where: `"messageId" IS NULL AND "reviewerType" = 'human'`,
})
@Index(['messageId', 'reviewerSub'], {
  unique: true,
  where: `"messageId" IS NOT NULL AND "reviewerType" = 'human'`,
})
export class ChatLogReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ChatLogSession, { onDelete: 'CASCADE' })
  session: ChatLogSession;

  @Column({ type: 'uuid', nullable: true })
  messageId: string | null;

  @ManyToOne(() => ChatLogMessage, { onDelete: 'CASCADE', nullable: true })
  message: ChatLogMessage | null;

  @Column({ type: 'varchar', length: 8 })
  rating: ReviewRating;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'text', nullable: true })
  expectedResult: string | null;

  @Column({ type: 'text', nullable: true })
  difference: string | null;

  @Column({ type: 'varchar', length: 8, default: 'human' })
  reviewerType: 'human' | 'llm';

  /** Reviewer's OIDC subject; `anonymous` when authentication is disabled. */
  @Column({ type: 'varchar' })
  reviewerSub: string;

  @Column({ type: 'varchar', nullable: true })
  reviewerName: string | null;

  /** For `llm` reviewers: model and prompt version (future). */
  @Column({ type: 'varchar', length: 128, nullable: true })
  evaluator: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
