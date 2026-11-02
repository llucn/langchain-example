import { NotFoundException } from '@nestjs/common';
import { MemoryService } from './memory.service';

/** A query builder that records what the admin list asks of it. */
const builder = (rows: unknown[]) => {
  const q = {
    where: [] as { sql: string; params: Record<string, unknown> }[],
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere(sql: string, params: Record<string, unknown>) {
      q.where.push({ sql, params });
      return q;
    },
    getCount: async () => rows.length,
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawAndEntities: async () => ({
      entities: rows.map((r) => (r as { m: object }).m),
      raw: rows.map((r) => (r as { raw: object }).raw),
    }),
  };
  return q;
};

const row = (id: string, ownerSub: string, email: string | null) => ({
  m: {
    id,
    ownerSub,
    content: 'c',
    source: 'agent',
    sessionId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  raw: { m_id: id, ownerEmail: email },
});

describe('MemoryService admin list', () => {
  it('adds the owner email to every item and pages the query', async () => {
    const q = builder([row('1', 'a', 'alice@x.com'), row('2', 'z', null)]);
    const service = new MemoryService({ createQueryBuilder: () => q } as never, {} as never);
    const page = await service.listAll({ page: 2, pageSize: 10 });
    expect(page.items.map((i) => i.ownerEmail)).toEqual(['alice@x.com', null]);
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 10 });
    expect(q.offset).toHaveBeenCalledWith(10);
    expect(q.limit).toHaveBeenCalledWith(10);
    expect(q.where).toEqual([]);
  });

  it('filters by a case-insensitive email substring with LIKE characters escaped', async () => {
    const q = builder([]);
    const service = new MemoryService({ createQueryBuilder: () => q } as never, {} as never);
    await service.listAll({ email: ' a_l%i ', page: 1, pageSize: 50 });
    expect(q.where[0].sql).toMatch(/ILIKE/);
    expect(q.where[0].params).toEqual({ email: '%a\\_l\\%i%' });
    q.where.length = 0;
    await service.listAll({ email: '   ', page: 1, pageSize: 50 });
    expect(q.where).toEqual([]);
  });

  it('edits any memory keeping owner and source, and reports unknown ids', async () => {
    const memory = { ...row('1', 'a', null).m, source: 'agent' };
    const memories = {
      findOne: jest.fn().mockResolvedValueOnce(memory).mockResolvedValueOnce(null),
      save: jest.fn(async (m: unknown) => m),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const users = { findOne: jest.fn().mockResolvedValue({ email: 'alice@x.com' }) };
    const service = new MemoryService(memories as never, users as never);
    const edited = await service.adminUpdate('1', '  new   text ');
    expect(edited).toMatchObject({
      content: 'new text',
      ownerSub: 'a',
      source: 'agent',
      ownerEmail: 'alice@x.com',
    });
    await expect(service.adminUpdate('2', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.adminRemove('3')).rejects.toBeInstanceOf(NotFoundException);
  });
});
