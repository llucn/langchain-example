import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ChatMessage as ChatMessageDto, ChatSession as ChatSessionDto } from '@app/shared';
import { Repository } from 'typeorm';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatSession } from '../database/entities/chat-session.entity';

const NAME_MAX = 80;

export const toSessionDto = (s: ChatSession): ChatSessionDto => ({
  id: s.id,
  name: s.name,
  startedAt: s.startedAt.toISOString(),
});

export const toMessageDto = (m: ChatMessage): ChatMessageDto => ({
  id: m.id,
  sessionId: m.sessionId,
  role: m.role,
  content: m.content,
  thinking: m.thinking,
  createdAt: m.createdAt.toISOString(),
});

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatSession) private readonly sessions: Repository<ChatSession>,
    @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
  ) {}

  createSession(ownerSub: string | null): Promise<ChatSession> {
    return this.sessions.save(this.sessions.create({ ownerSub, name: null }));
  }

  listSessions(ownerSub: string | null): Promise<ChatSession[]> {
    return this.sessions.find({
      where: { ownerSub: ownerSub ?? undefined },
      order: { startedAt: 'DESC' },
    });
  }

  async getSession(id: string, ownerSub: string | null): Promise<ChatSession> {
    const session = await this.sessions.findOne({ where: { id, ownerSub: ownerSub ?? undefined } });
    if (!session) throw new NotFoundException('Chat session not found');
    return session;
  }

  listMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.messages.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
  }

  /** Stores the user's message; the first one also names the session. */
  async addUserMessage(session: ChatSession, content: string): Promise<ChatMessage> {
    if (session.name === null) {
      session.name = content.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
      await this.sessions.update(session.id, { name: session.name });
    }
    return this.messages.save(
      this.messages.create({ sessionId: session.id, role: 'user', content, thinking: null }),
    );
  }

  addAssistantMessage(sessionId: string, content: string, thinking: string): Promise<ChatMessage> {
    return this.messages.save(
      this.messages.create({ sessionId, role: 'assistant', content, thinking }),
    );
  }

  /** Placeholder for the future AI: thinks out loud and answers with the user's input verbatim. */
  think(input: string): { thinking: string; answer: string } {
    return { thinking: input, answer: input };
  }
}
