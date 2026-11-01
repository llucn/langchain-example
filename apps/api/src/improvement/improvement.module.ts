import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import { ChatLogMessage } from '../database/entities/chat-log-message.entity';
import { ChatLogReview } from '../database/entities/chat-log-review.entity';
import { ImprovementCase } from '../database/entities/improvement-case.entity';
import { ImprovementProposal } from '../database/entities/improvement-proposal.entity';
import { ImprovementController } from './improvement.controller';
import { ImprovementService } from './improvement.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImprovementProposal,
      ImprovementCase,
      ChatLogReview,
      ChatLogMessage,
      AgentConfigSnapshot,
    ]),
  ],
  controllers: [ImprovementController],
  providers: [ImprovementService],
})
export class ImprovementModule {}
