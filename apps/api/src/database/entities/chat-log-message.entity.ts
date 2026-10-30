import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ChatLogMessageType, ChatLogToolCall } from '@app/shared';
import { ChatLogSession } from './chat-log-session.entity';

/** One event of a chat run (see the chat-logging spec). */
@Entity('chat_log_messages')
@Index(['sessionId', 'seq'], { unique: true })
@Index(['agentName', 'agentConfigHash'])
export class ChatLogMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ChatLogSession, { onDelete: 'CASCADE' })
  session: ChatLogSession;

  @Column({ type: 'int' })
  seq: number;

  /** All events caused by one user message share it. */
  @Index()
  @Column({ type: 'uuid' })
  turnId: string;

  @Column({ type: 'varchar', length: 24 })
  type: ChatLogMessageType;

  @Column({ type: 'varchar', nullable: true })
  userSub: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  agentName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  agentConfigVersion: string | null;

  /** FK to `agent_config_snapshots.hash` (declared in the migration). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  agentConfigHash: string | null;

  @Column({ type: 'varchar', length: 64 })
  appVersion: string;

  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'boolean', default: false })
  truncated: boolean;

  @Column({ type: 'text', nullable: true })
  thinking: string | null;

  @Column({ type: 'jsonb', nullable: true })
  toolCalls: ChatLogToolCall[] | null;

  @Column({ type: 'varchar', nullable: true })
  toolName: string | null;

  @Column({ type: 'varchar', nullable: true })
  toolCallId: string | null;

  @Column({ type: 'varchar', length: 8, default: 'ok' })
  status: 'ok' | 'error';

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  /** Event time (when it ended). */
  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  /** The `chat_messages` row of a user input / final answer; no FK (the chat may be deleted). */
  @Column({ type: 'uuid', nullable: true })
  chatMessageId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;
}
