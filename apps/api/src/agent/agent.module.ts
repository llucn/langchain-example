import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from '../database/entities/chat-session.entity';
import { User } from '../database/entities/user.entity';
import { AgentService } from './agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ChatSession])],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
