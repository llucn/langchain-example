import type { Repository } from 'typeorm';
import type { User } from '../../database/entities/user.entity';
import { listUsers, USERS_MAX_LIMIT } from './get-users.tool';
import { mockSendMail } from './send-mail.tool';
import { mockWeather } from './get-weather.tool';

describe('getWeather', () => {
  it('is deterministic and shaped', () => {
    const a = mockWeather('Paris');
    expect(mockWeather('Paris')).toEqual(a);
    expect(a).toMatchObject({ city: 'Paris', source: 'mock' });
    expect(typeof a.temperatureC).toBe('number');
    expect(typeof a.humidity).toBe('number');
  });
});

describe('getUsers', () => {
  const find = jest.fn();
  const repo = { find } as unknown as Repository<User>;
  beforeEach(() =>
    find.mockResolvedValue([
      { id: '1', email: 'a@b.c', sub: 'secret', createdAt: new Date('2026-01-01T00:00:00Z') },
    ]),
  );

  it('never leaks the OIDC subject', async () => {
    const [u] = await listUsers(repo);
    expect(u).toEqual({ id: '1', email: 'a@b.c', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(u).not.toHaveProperty('sub');
  });

  it('caps the limit', async () => {
    await listUsers(repo, 500);
    expect(find).toHaveBeenLastCalledWith(expect.objectContaining({ take: USERS_MAX_LIMIT }));
    await listUsers(repo);
    expect(find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 10 }));
  });
});

describe('sendMail', () => {
  it('always succeeds without sending anything', () => {
    expect(mockSendMail(['a@b.c'], 'Hi', 'Hello')).toEqual({
      success: true,
      to: ['a@b.c'],
      subject: 'Hi',
      bodyLength: 5,
      source: 'mock',
    });
  });
});
