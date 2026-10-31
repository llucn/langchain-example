import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Log record of a chat session. `id` is the chat session's id, but there is deliberately no
 * foreign key: the log outlives the session (deleting it only sets `deletedAt`).
 */
@Entity('chat_log_sessions')
export class ChatLogSession {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  userSub: string | null;

  /** Email/username at the time, so the review UI needs no user lookup. */
  @Column({ type: 'varchar', nullable: true })
  userName: string | null;

  @Column({ type: 'varchar', length: 64 })
  appVersion: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  /** Session name snapshot, refreshed on renames. */
  @Column({ type: 'text', nullable: true })
  name: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** Number of logged events; also the allocator of `ChatLogMessage.seq`. */
  @Column({ type: 'int', default: 0 })
  messageCount: number;
}
