import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_ENV, AppEnv } from '../config/env';

export const REDIS = 'REDIS';

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_ENV],
      useFactory: ({ redis }: AppEnv) =>
        new Redis({
          host: redis.host,
          port: redis.port,
          password: redis.password,
          db: redis.db,
          tls: redis.tls ? { host: redis.host } : undefined,
          maxRetriesPerRequest: 2,
        }),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
