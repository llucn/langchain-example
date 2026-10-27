import { buildTools } from './index';
import type { Repository } from 'typeorm';
import type { ChatSession } from '../../database/entities/chat-session.entity';
import type { User } from '../../database/entities/user.entity';
import { listUsers, USERS_MAX_LIMIT } from './get-users.tool';
import { mockSendMail } from './send-mail.tool';
import { mockWeather } from './get-weather.tool';
import {
  createRenameSessionTool,
  updateSessionName,
  SESSION_NAME_MAX,
} from './rename-session.tool';

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

describe('renameSession', () => {
  const update = jest.fn();
  const sessions = { update } as unknown as Repository<ChatSession>;

  it('normalizes, caps and stores the name for the given session', async () => {
    expect(
      await updateSessionName(sessions, 'sid', `  Trip \n  plan ${'x'.repeat(200)}`),
    ).toHaveLength(SESSION_NAME_MAX);
    expect(update).toHaveBeenCalledWith('sid', { name: expect.stringMatching(/^Trip plan x/) });
  });

  it('rejects an empty name', async () => {
    update.mockClear();
    expect(await updateSessionName(sessions, 'sid', '   ')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('gets the session id from context, not from the LLM schema', async () => {
    const t = createRenameSessionTool({ sessions, sessionId: 'ctx-id' } as never);
    await t.invoke({ name: 'Hello' });
    expect(update).toHaveBeenCalledWith('ctx-id', { name: 'Hello' });
  });
});

describe('tool registry', () => {
  it('registers renameSession and selectAgent', () => {
    const names = buildTools({ sessions: {}, users: {}, sessionId: 's' } as never).map(
      (t) => t.name,
    );
    expect(names).toEqual(['renameSession', 'selectAgent']);
  });
});
