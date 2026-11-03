import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AgentConfigModule } from './agent-config/agent-config.module';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ImprovementModule } from './improvement/improvement.module';
import { MemoryModule } from './memory/memory.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    SettingsModule,
    AgentConfigModule,
    RedisModule,
    AuthModule,
    ChatModule,
    HealthModule,
    ImprovementModule,
    MemoryModule,
  ],
})
export class AppModule {}
