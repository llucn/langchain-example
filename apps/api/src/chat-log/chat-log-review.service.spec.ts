import { BadRequestException, NotFoundException } from '@nestjs/common';
import { buildSessionFilter, ChatLogReviewService } from './chat-log-review.service';

describe('buildSessionFilter', () => {
  it('has no WHERE without filters', () => {
    expect(buildSessionFilter({})).toEqual({ where: '', params: [] });
  });

  it('combines filters with numbered parameters', () => {
    const { where, params } = buildSessionFilter({
      user: 'bo_b',
      agent: 'selector',
      appVersion: '1.0.0',
      rating: 'bad',
    });
    expect(params).toEqual(['%bo\\_b%', 'selector', '1.0.0', 'bad']);
    expect(where).toContain('$1');
    expect(where).toContain('$4');
    expect(where.startsWith('WHERE ')).toBe(true);
  });

  it('unreviewed needs no parameter', () => {
    const { where, params } = buildSessionFilter({ rating: 'unreviewed' });
    expect(params).toEqual([]);
    expect(where).toContain('NOT EXISTS');
  });
});

describe('ChatLogReviewService.saveReview', () => {
  const reviewer = { sub: 'u1', name: 'Ann' };
  const make = (opts: {
    session?: boolean;
    message?: { sessionId: string } | null;
    own?: object;
  }) => {
    const saved: unknown[] = [];
    const qb = { where: () => qb, andWhere: () => qb, getOne: async () => opts.own ?? null };
    const reviews = {
      createQueryBuilder: () => qb,
      create: (v: object) => ({ id: 'r1', createdAt: new Date(), updatedAt: new Date(), ...v }),
      save: jest.fn(async (v: object) => (saved.push(v), v)),
    };
    const svc = new ChatLogReviewService(
      {} as never,
      { existsBy: async () => opts.session ?? true } as never,
      { findOneBy: async () => opts.message ?? null } as never,
      reviews as never,
    );
    return { svc, saved };
  };

  it('rejects expected result on a session review', async () => {
    const { svc } = make({});
    await expect(
      svc.saveReview(
        { kind: 'session', id: 's' },
        { rating: 'bad', expectedResult: 'x' },
        reviewer,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s for unknown targets', async () => {
    await expect(
      make({ session: false }).svc.saveReview(
        { kind: 'session', id: 's' },
        { rating: 'good' },
        reviewer,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(
      make({ message: null }).svc.saveReview(
        { kind: 'message', id: 'm' },
        { rating: 'good' },
        reviewer,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a message review with the message session and expected result', async () => {
    const { svc } = make({ message: { sessionId: 's9' } });
    const r = await svc.saveReview(
      { kind: 'message', id: 'm1' },
      {
        rating: 'bad',
        comment: ' wrong ',
        expectedResult: 'A',
        tags: ['wrong_tool'],
      },
      reviewer,
    );
    expect(r).toEqual(
      expect.objectContaining({
        sessionId: 's9',
        messageId: 'm1',
        rating: 'bad',
        comment: 'wrong',
        expectedResult: 'A',
        reviewerType: 'human',
        reviewerSub: 'u1',
      }),
    );
  });

  it('updates the existing review of the reviewer instead of adding one', async () => {
    const own = { id: 'r0', rating: 'bad', createdAt: new Date(), updatedAt: new Date() };
    const { svc, saved } = make({ own });
    const r = await svc.saveReview({ kind: 'session', id: 's' }, { rating: 'good' }, reviewer);
    expect(saved).toHaveLength(1);
    expect(r.id).toBe('r0');
    expect(r.rating).toBe('good');
  });
});
