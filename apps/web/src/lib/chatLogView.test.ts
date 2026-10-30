import type { ChatLogMessage, ChatLogReview } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { formatDuration, groupByTurn, ownReview, reviewsOf, upsertReview } from './chatLogView';

const ev = (seq: number, turnId: string) => ({ seq, turnId }) as ChatLogMessage;
const review = (id: string, messageId: string | null, sub: string) =>
  ({ id, messageId, reviewerSub: sub, reviewerType: 'human', rating: 'good' }) as ChatLogReview;

describe('groupByTurn', () => {
  it('groups consecutive and interleaved events by turn in first-seen order', () => {
    const turns = groupByTurn([ev(1, 'a'), ev(2, 'a'), ev(3, 'b'), ev(4, 'a')]);
    expect(turns.map((t) => [t.turnId, t.events.map((e) => e.seq)])).toEqual([
      ['a', [1, 2, 4]],
      ['b', [3]],
    ]);
  });
});

describe('reviews', () => {
  const all = [review('1', null, 'u1'), review('2', 'm1', 'u1'), review('3', 'm1', 'u2')];

  it('splits session and message reviews', () => {
    expect(reviewsOf(all, null).map((r) => r.id)).toEqual(['1']);
    expect(reviewsOf(all, 'm1').map((r) => r.id)).toEqual(['2', '3']);
  });

  it('finds the own review only', () => {
    expect(ownReview(all, 'm1', 'u2')?.id).toBe('3');
    expect(ownReview(all, null, 'u2')).toBeUndefined();
  });

  it('upserts instead of duplicating', () => {
    const changed = { ...all[1], rating: 'bad' } as ChatLogReview;
    expect(upsertReview(all, changed)).toHaveLength(3);
    expect(upsertReview(all, changed)[1].rating).toBe('bad');
    expect(upsertReview(all, review('4', 'm2', 'u1'))).toHaveLength(4);
  });
});

describe('formatDuration', () => {
  it('formats ms and seconds, empty for none', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(850)).toBe('850 ms');
    expect(formatDuration(2400)).toBe('2.4 s');
  });
});
