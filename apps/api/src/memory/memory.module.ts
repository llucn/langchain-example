import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { UserMemory } from '../database/entities/user-memory.entity';
import { AdminMemoryController, MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserMemory, User])],
  controllers: [MemoryController, AdminMemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
