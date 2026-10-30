import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { ChatSession } from '../database/entities/chat-session.entity';
import { AgentModule } from '../agent/agent.module';
import { ChatLogModule } from '../chat-log/chat-log.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatSession, ChatMessage]), AgentModule, ChatLogModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
