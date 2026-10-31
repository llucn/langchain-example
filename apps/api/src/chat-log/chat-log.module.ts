import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { ChatLogSession } from '../database/entities/chat-log-session.entity';
import { ChatLogReviewController } from './chat-log-review.controller';
import { ChatLogReviewService } from './chat-log-review.service';
import { ChatLogService } from './chat-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatLogSession, ChatLogMessage, ChatLogReview, AgentConfigSnapshot]),
  ],
  controllers: [ChatLogReviewController],
  providers: [ChatLogService, ChatLogReviewService],
  exports: [ChatLogService],
})
export class ChatLogModule {}
