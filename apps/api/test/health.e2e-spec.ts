import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication;
  const check = jest.fn();

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: { check } }],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('200 when dependencies are up', async () => {
    check.mockResolvedValue({
      status: 'ok',
      timestamp: 'x',
      checks: { database: 'up', redis: 'up' },
    });
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('503 when a dependency is down', async () => {
    check.mockResolvedValue({
      status: 'error',
      timestamp: 'x',
      checks: { database: 'down', redis: 'up' },
    });
    await request(app.getHttpServer()).get('/api/health').expect(503);
  });
});
