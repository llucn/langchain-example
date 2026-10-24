import { HealthService } from './health.service';

const make = (db: () => Promise<unknown>, ping: () => Promise<unknown>) =>
  new HealthService({ query: db } as never, { ping } as never);

describe('HealthService', () => {
  it('reports ok when db and redis are up', async () => {
    const res = await make(
      async () => [],
      async () => 'PONG',
    ).check();
    expect(res.status).toBe('ok');
    expect(res.checks).toEqual({ database: 'up', redis: 'up' });
  });

  it('reports error when a dependency is down', async () => {
    const res = await make(
      async () => [],
      async () => {
        throw new Error('down');
      },
    ).check();
    expect(res.status).toBe('error');
    expect(res.checks.redis).toBe('down');
  });
});
