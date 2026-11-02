import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from '../database/entities/chat-session.entity';
import { User } from '../database/entities/user.entity';
import { MemoryModule } from '../memory/memory.module';
import { AgentService } from './agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ChatSession]), MemoryModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
