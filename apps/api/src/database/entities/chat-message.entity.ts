import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ChatRole } from '@app/shared';
import { ChatSession } from './chat-session.entity';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => ChatSession, (s) => s.messages, { onDelete: 'CASCADE' })
  session: ChatSession;

  @Column({ type: 'varchar', length: 16 })
  role: ChatRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  thinking: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
