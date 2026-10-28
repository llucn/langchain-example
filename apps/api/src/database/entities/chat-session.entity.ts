import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner's OIDC subject; null when auth is disabled. */
  @Column({ type: 'varchar', nullable: true })
  ownerSub: string | null;

  /** First user message; null until the first message is sent. */
  @Column({ type: 'text', nullable: true })
  name: string | null;

  /** The agent that handles this session's next message (see agent.config.ts). */
  @Column({ type: 'varchar', length: 64, default: 'selector' })
  agent: string;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt: Date;

  @OneToMany(() => ChatMessage, (m) => m.session)
  messages: ChatMessage[];
}
