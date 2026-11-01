import type { ChatLogReview, ImprovementReplay } from '@app/shared';
import { describe, expect, it } from 'vitest';
import {
  canDiscard,
  canSelectForImprovement,
  diffLineKind,
  isGenerating,
  regressionCount,
  replayTally,
  sortReplays,
  pruneSelection,
  shortCommit,
  toggleSelection,
} from './improvementView';

const review = (id: string, rating: 'good' | 'bad', messageId: string | null) =>
  ({ id, rating, messageId }) as ChatLogReview;

describe('canSelectForImprovement', () => {
  it('accepts only Bad message reviews', () => {
    expect(canSelectForImprovement(review('a', 'bad', 'm'))).toBe(true);
    expect(canSelectForImprovement(review('a', 'good', 'm'))).toBe(false);
    expect(canSelectForImprovement(review('a', 'bad', null))).toBe(false);
  });
});

describe('toggleSelection', () => {
  it('adds and removes ids without mutating the input', () => {
    const a = new Set<string>();
    const b = toggleSelection(a, 'x');
    expect([...a]).toEqual([]);
    expect([...b]).toEqual(['x']);
    expect([...toggleSelection(b, 'x')]).toEqual([]);
  });

  it('refuses to exceed the maximum', () => {
    const full = new Set(['1', '2']);
    expect([...toggleSelection(full, '3', 2)]).toEqual(['1', '2']);
    expect([...toggleSelection(full, '2', 2)]).toEqual(['1']);
  });
});

describe('pruneSelection', () => {
  it('drops ids of this session that are no longer Bad, keeps ids of other sessions', () => {
    const reviews = [review('a', 'good', 'm1'), review('b', 'bad', 'm2')];
    expect([...pruneSelection(new Set(['a', 'b', 'other']), reviews)].sort()).toEqual([
      'b',
      'other',
    ]);
  });
});

describe('status helpers', () => {
  it('polls only while generating', () => {
    expect(isGenerating('generating')).toBe(true);
    expect(isGenerating('ready')).toBe(false);
  });

  it('allows discarding only finished proposals', () => {
    expect(canDiscard('ready')).toBe(true);
    expect(canDiscard('failed')).toBe(true);
    expect(canDiscard('generating')).toBe(false);
    expect(canDiscard('discarded')).toBe(false);
  });

  it('shortens a commit id', () => {
    expect(shortCommit('beb19e71674ac32ecd5e61903e9e9c948e1eb20f')).toBe('beb19e7');
  });
});

describe('diffLineKind', () => {
  it('classifies unified diff lines', () => {
    expect(diffLineKind('--- a/x')).toBe('meta');
    expect(diffLineKind('+++ b/x')).toBe('meta');
    expect(diffLineKind('@@ -1,2 +1,2 @@')).toBe('hunk');
    expect(diffLineKind('+new')).toBe('add');
    expect(diffLineKind('-old')).toBe('del');
    expect(diffLineKind(' same')).toBe('ctx');
  });
});

const replay = (id: string, verdict: string | null, error: string | null = null) =>
  ({
    id,
    verdict: verdict ? { verdict, reason: 'r' } : null,
    error,
  }) as unknown as ImprovementReplay;

describe('replay helpers', () => {
  const list = [
    replay('a', 'same'),
    replay('b', null, 'boom'),
    replay('c', 'regressed'),
    replay('d', 'improved'),
  ];

  it('puts regressions first and failures last', () => {
    expect(sortReplays(list).map((r) => r.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(list[0].id).toBe('a');
  });

  it('counts regressions and tallies verdicts', () => {
    expect(regressionCount(list)).toBe(1);
    expect(replayTally(list)).toBe(
      '4 replayed: 1 improved, 1 same, 1 regressed, 0 inconclusive, 1 failed.',
    );
    expect(replayTally([])).toBe('No replay results.');
  });
});
