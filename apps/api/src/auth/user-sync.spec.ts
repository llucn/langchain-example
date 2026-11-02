import { syncUser } from './user-sync';

const repo = (existing?: { sub: string; email: string | null }) => ({
  findOne: jest.fn().mockResolvedValue(existing ?? null),
  insert: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
});

describe('syncUser', () => {
  it('inserts a missing user with the token email', async () => {
    const r = repo();
    expect(await syncUser(r as never, { sub: 'a', email: 'a@x.com' })).toBe(true);
    expect(r.insert).toHaveBeenCalledWith({ sub: 'a', email: 'a@x.com' });
  });

  it('updates a changed email', async () => {
    const r = repo({ sub: 'a', email: 'old@x.com' });
    expect(await syncUser(r as never, { sub: 'a', email: 'a@x.com' })).toBe(true);
    expect(r.update).toHaveBeenCalledWith({ sub: 'a' }, { email: 'a@x.com' });
  });

  it('writes nothing when unchanged', async () => {
    const r = repo({ sub: 'a', email: 'a@x.com' });
    expect(await syncUser(r as never, { sub: 'a', email: 'a@x.com' })).toBe(false);
    expect(r.insert).not.toHaveBeenCalled();
    expect(r.update).not.toHaveBeenCalled();
  });

  it('keeps a known email when the token has none', async () => {
    const r = repo({ sub: 'a', email: 'a@x.com' });
    expect(await syncUser(r as never, { sub: 'a' })).toBe(false);
    expect(r.update).not.toHaveBeenCalled();
  });

  it('does nothing without a token or sub', async () => {
    const r = repo();
    expect(await syncUser(r as never, undefined)).toBe(false);
    expect(await syncUser(r as never, { email: 'a@x.com' })).toBe(false);
    expect(r.findOne).not.toHaveBeenCalled();
  });
});
