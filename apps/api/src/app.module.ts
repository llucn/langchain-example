import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AgentConfigModule } from './agent-config/agent-config.module';
import { ChatModule } from './chat/chat.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AgentConfigModule,
    RedisModule,
    AuthModule,
    ChatModule,
    HealthModule,
  ],
})
export class AppModule {}
