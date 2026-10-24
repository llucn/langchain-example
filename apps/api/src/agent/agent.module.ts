import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { AgentService } from './agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
