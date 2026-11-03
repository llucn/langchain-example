import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MEMORY_MAX_PER_USER } from '@app/shared';
import { UserMemory } from '../database/entities/user-memory.entity';
import { MemoryService, contentProblem, normalizeMemory, shortId } from './memory.service';

/** A minimal in-memory stand-in for the memory repository (owner filter, order and take only). */
function fakeRepo() {
  const rows: UserMemory[] = [];
  let seq = 0;
  const matches = (where: Record<string, unknown> | undefined) => (m: UserMemory) =>
    !where ||
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object'
        ? m[k as keyof UserMemory] === null
        : m[k as keyof UserMemory] === v,
    );
  const repo = {
    rows,
    create: (x: Partial<UserMemory>) => ({ ...x }) as UserMemory,
    save: async (x: UserMemory) => {
      if (!x.id) {
        seq += 1;
        Object.assign(x, {
          id: `${String(seq).padStart(8, '0')}-0000-4000-8000-000000000000`,
          createdAt: new Date(2026, 0, 1, 0, 0, seq),
          updatedAt: new Date(2026, 0, 1, 0, 0, seq),
        });
        rows.push(x);
      }
      return x;
    },
    find: async (opts: {
      where?: Record<string, unknown>;
      order?: Record<string, string>;
      take?: number;
    }) => {
      let r = rows.filter(matches(opts?.where));
      const dir = opts?.order?.createdAt;
      if (dir) r = [...r].sort((a, b) => (dir === 'ASC' ? 1 : -1) * (+a.createdAt - +b.createdAt));
      return opts?.take ? r.slice(0, opts.take) : r;
    },
    findOne: async (opts: { where: Record<string, unknown> }) =>
      rows.find(matches(opts.where)) ?? null,
    count: async (opts: { where: Record<string, unknown> }) =>
      rows.filter(matches(opts.where)).length,
    delete: async (id: string) => {
      const at = rows.findIndex((m) => m.id === id);
      if (at >= 0) rows.splice(at, 1);
      return { affected: at >= 0 ? 1 : 0 };
    },
    manager: {} as { transaction: unknown; getRepository: unknown },
  };
  repo.manager = {
    transaction: async (cb: (m: unknown) => unknown) => cb(repo.manager),
    getRepository: () => repo,
  };
  return repo;
}

const make = () => {
  const repo = fakeRepo();
  return { repo, service: new MemoryService(repo as never, {} as never) };
};

describe('memory helpers', () => {
  it('normalizes and validates content', () => {
    expect(normalizeMemory('  a \n b  ')).toBe('a b');
    expect(contentProblem('')).toMatch(/empty/);
    expect(contentProblem('x'.repeat(501))).toMatch(/500/);
    expect(contentProblem('ok')).toBeNull();
    expect(shortId('12345678-aaaa')).toBe('12345678');
  });
});

describe('MemoryService', () => {
  it('stores user memories with owner and source', async () => {
    const { service } = make();
    const m = await service.create('a', ' Works in  building 3 ');
    expect(m).toMatchObject({ ownerSub: 'a', content: 'Works in building 3', source: 'user' });
  });

  it('rejects blank and over-long content', async () => {
    const { service } = make();
    await expect(service.create('a', '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('a', 'x'.repeat(501))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save('a', '', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists only the owner memories, newest first, and the null owner bucket', async () => {
    const { service } = make();
    await service.create('a', 'one');
    await service.create('b', 'other');
    await service.create('a', 'two');
    await service.create(null, 'anon');
    expect((await service.list('a')).map((m) => m.content)).toEqual(['two', 'one']);
    expect((await service.list(null)).map((m) => m.content)).toEqual(['anon']);
  });

  it('recent returns the newest N, oldest first', async () => {
    const { service } = make();
    for (const c of ['1', '2', '3']) await service.create('a', c);
    expect((await service.recent('a', 2)).map((m) => m.content)).toEqual(['2', '3']);
  });

  it('save stores an agent memory with the session and skips a case-insensitive duplicate', async () => {
    const { service, repo } = make();
    const first = await service.save('a', 'Likes tea', 's1');
    expect(first.created).toBe(true);
    expect(first.memory).toMatchObject({ source: 'agent', sessionId: 's1' });
    const again = await service.save('a', 'likes TEA', 's2');
    expect(again.created).toBe(false);
    expect(repo.rows).toHaveLength(1);
  });

  it('save evicts the oldest memory when the owner is at the maximum', async () => {
    const { service, repo } = make();
    for (let i = 0; i < MEMORY_MAX_PER_USER; i++) await service.create('a', `m${i}`);
    await service.create('b', 'not mine');
    const result = await service.save('a', 'new fact', null);
    expect(result.created).toBe(true);
    expect(result.evicted?.content).toBe('m0');
    const mine = await service.list('a');
    expect(mine).toHaveLength(MEMORY_MAX_PER_USER);
    expect(mine.some((m) => m.content === 'm0')).toBe(false);
    expect(mine[0].content).toBe('new fact');
    expect(repo.rows.some((m) => m.content === 'not mine')).toBe(true);
  });

  it('save of a duplicate at the maximum deletes nothing', async () => {
    const { service } = make();
    for (let i = 0; i < MEMORY_MAX_PER_USER; i++) await service.create('a', `m${i}`);
    const result = await service.save('a', 'M5', null);
    expect(result.created).toBe(false);
    expect(await service.list('a')).toHaveLength(MEMORY_MAX_PER_USER);
  });

  it('manual create rejects when the owner is full', async () => {
    const { service } = make();
    for (let i = 0; i < MEMORY_MAX_PER_USER; i++) await service.create('a', `m${i}`);
    await expect(service.create('a', 'one more')).rejects.toThrow(/full/);
  });

  it('finds by full or short id within the owner only', async () => {
    const { service } = make();
    const mine = await service.create('a', 'mine');
    const theirs = await service.create('b', 'theirs');
    expect(await service.findByRef('a', mine.id)).toBe(mine);
    expect(await service.findByRef('a', shortId(mine.id))).toBe(mine);
    expect(await service.findByRef('a', theirs.id)).toBeUndefined();
    expect(await service.findByRef('a', 'zzz')).toBeUndefined();
  });

  it('update and remove are scoped to the owner', async () => {
    const { service } = make();
    const theirs = await service.create('b', 'theirs');
    await expect(service.update('a', theirs.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('a', theirs.id)).rejects.toBeInstanceOf(NotFoundException);
    const mine = await service.create('a', 'old');
    const edited = await service.update('a', mine.id, 'new');
    expect(edited.content).toBe('new');
    expect(edited.source).toBe('user');
    await service.remove('a', mine.id);
    expect(await service.list('a')).toEqual([]);
  });
});
