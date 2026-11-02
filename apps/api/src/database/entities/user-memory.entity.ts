import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MemorySource } from '@app/shared';

/** A long-term note of a user (see `user-memory`); the owner's email is found through `users.sub`. */
@Entity('user_memories')
@Index(['ownerSub', 'updatedAt'])
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner's OIDC subject; null when auth is disabled. */
  @Column({ type: 'varchar', nullable: true })
  ownerSub: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 16 })
  source: MemorySource;

  /** Session it was saved in; cleared when the session is deleted. */
  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
