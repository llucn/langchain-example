import { AGENTS } from '../agent/agent.config';
import { ChatLogService, LOG_FIELD_CAP, cap, logUserOf } from './chat-log.service';

const makeService = () => {
  const inserted: Record<string, unknown>[] = [];
  const snapshotInserts: unknown[] = [];
  let seq = 0;
  const insertQb = (sink: unknown[]) => {
    const qb = {
      insert: () => qb,
      values: (v: unknown) => (sink.push(v), qb),
      orIgnore: () => qb,
      execute: async () => ({}),
    };
    return qb;
  };
  const sessions = {
    createQueryBuilder: () => {
      const qb = {
        ...insertQb([]),
        update: () => qb,
        set: () => qb,
        where: () => qb,
        returning: () => qb,
        execute: async () => ({ raw: [{ messageCount: ++seq }] }),
      };
      return qb;
    },
    update: jest.fn(async () => ({})),
  };
  const messages = {
    insert: jest.fn(async (row: Record<string, unknown>) => void inserted.push(row)),
    update: jest.fn(async () => ({})),
  };
  const snapshots = { createQueryBuilder: () => insertQb(snapshotInserts) };
  const svc = new ChatLogService(
    { app: { version: '1.2.3' } } as never,
    sessions as never,
    messages as never,
    snapshots as never,
  );
  return { svc, inserted, snapshotInserts, messages, sessions };
};

const session = { id: 's1', startedAt: new Date(), name: null };
const user = { sub: 'u1', name: 'a@b.c' };

describe('cap', () => {
  it('truncates over the limit and flags it', () => {
    expect(cap('abc')).toEqual({ value: 'abc', truncated: false });
    const r = cap('x'.repeat(LOG_FIELD_CAP + 5));
    expect(r.value).toHaveLength(LOG_FIELD_CAP);
    expect(r.truncated).toBe(true);
  });
});

describe('logUserOf', () => {
  it('reads sub and a display name; empty without auth', () => {
    expect(logUserOf({ sub: 'u', 'cognito:username': 'bob' })).toEqual({ sub: 'u', name: 'bob' });
    expect(logUserOf(undefined)).toEqual({ sub: null, name: null });
  });
});

describe('ChatLogRun', () => {
  it('writes events in order with turn, seq, app version and config identity', async () => {
    const { svc, inserted, snapshotInserts } = makeService();
    const run = svc.startRun(session, user, 'selector');
    run.userInput('hi', 'm1');
    run.onLlm({
      agent: 'selector',
      content: '',
      thinking: 'think',
      toolCalls: [{ id: 'c1', name: 'selectAgent', args: {} }],
      model: 'm',
      startedAt: null,
      durationMs: 12,
      metadata: {},
    });
    run.onToolResult({
      agent: 'selector',
      toolName: 'selectAgent',
      toolCallId: 'c1',
      content: 'ok',
      status: 'ok',
      startedAt: null,
      durationMs: 3,
      metadata: {},
    });
    run.onLlm({
      agent: 'other',
      content: 'answer',
      thinking: null,
      toolCalls: [],
      model: 'm',
      startedAt: null,
      durationMs: 20,
      metadata: {},
    });
    await run.flush();

    expect(inserted.map((r) => [r.seq, r.type, r.agentName])).toEqual([
      [1, 'user_input', 'selector'],
      [2, 'llm_tool_use', 'selector'],
      [3, 'agent_tool_result', 'selector'],
      [4, 'llm_end_turn', 'other'],
    ]);
    expect(new Set(inserted.map((r) => r.turnId)).size).toBe(1);
    expect(inserted[0]).toEqual(
      expect.objectContaining({ appVersion: '1.2.3', userSub: 'u1', durationMs: null }),
    );
    expect(inserted[1]).toEqual(expect.objectContaining({ durationMs: 12, thinking: 'think' }));
    expect(inserted[3].agentConfigVersion).toBe(AGENTS.other.version);
    expect(inserted[3].agentConfigHash).toMatch(/^[0-9a-f]{64}$/);
    // one snapshot per distinct agent, not per event
    expect(snapshotInserts).toHaveLength(2);
  });

  it('stores a failed run as run_error and flags truncated content', async () => {
    const { svc, inserted } = makeService();
    const run = svc.startRun(session, user, 'selector');
    run.onToolResult({
      agent: 'selector',
      toolName: 't',
      toolCallId: 'c',
      content: 'x'.repeat(LOG_FIELD_CAP + 1),
      status: 'error',
      startedAt: null,
      durationMs: null,
      metadata: {},
    });
    run.error('model down', 'selector');
    await run.flush();
    expect(inserted[0]).toEqual(expect.objectContaining({ truncated: true, status: 'error' }));
    expect(inserted[1]).toEqual(
      expect.objectContaining({ type: 'run_error', errorMessage: 'model down' }),
    );
  });

  it('never throws when the database fails', async () => {
    const { svc, messages } = makeService();
    messages.insert.mockRejectedValue(new Error('db down'));
    const run = svc.startRun(session, user, 'other');
    run.userInput('hi', 'm1');
    await expect(run.flush()).resolves.toBeUndefined();
  });

  it('links the final answer to the chat message', async () => {
    const { svc, messages } = makeService();
    const run = svc.startRun(session, user, 'other');
    run.linkAnswer('chat-1');
    await run.flush();
    expect(messages.update).toHaveBeenCalledWith(
      { sessionId: 's1', turnId: run.turnId, type: 'llm_end_turn' },
      { chatMessageId: 'chat-1' },
    );
  });
});
