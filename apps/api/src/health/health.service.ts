import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { HealthResponse, ServiceStatus } from '@app/shared';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.dataSource.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    };
  }

  private async probe(fn: () => Promise<unknown>): Promise<ServiceStatus> {
    try {
      await fn();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
