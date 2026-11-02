import type { ImprovementReplay } from '@app/shared';
import { branchName, pullRequestBody, replaySummary } from './pull-request';

const replay = (
  id: string,
  kind: 'target' | 'regression',
  verdict: string | null,
  error: string | null = null,
) =>
  ({
    id,
    reviewId: `${id}-review-id`,
    kind,
    old: null,
    new: null,
    verdict: verdict ? { verdict, reason: `why ${id}` } : null,
    error,
  }) as ImprovementReplay;

describe('replaySummary', () => {
  it('lists regressions first and counts them', () => {
    const out = replaySummary([
      replay('a', 'target', 'improved'),
      replay('b', 'regression', 'regressed'),
      replay('c', 'regression', 'same'),
    ]);
    const lines = out.split('\n');
    expect(lines[0]).toContain('1 regression found');
    expect(lines[1]).toContain('regressed');
    expect(out).toContain('run once');
  });

  it('shows a failed replay and handles none', () => {
    expect(replaySummary([replay('a', 'target', null, 'boom')])).toContain('replay failed: boom');
    expect(replaySummary([])).toBe('No replay results.');
  });
});

describe('pullRequestBody', () => {
  it('has rationale, review ids and the replay summary', () => {
    const body = pullRequestBody({
      proposalId: 'abcdef12-0000',
      agentName: 'fault_report',
      rationale: 'Fixes it.',
      baseCommit: 'beb19e71674ac32',
      reviewIds: ['r1'],
      diagnoses: [
        {
          reviewId: 'r1',
          diagnosis: {
            layer: 'prompt',
            rootCause: 'contradiction',
            evidence: [],
            confidence: 1,
            suggestedAction: '',
          },
        },
      ],
      replays: [replay('a', 'target', 'improved')],
    });
    expect(body).toContain('Fixes it.');
    expect(body).toContain('r1: prompt - contradiction');
    expect(body).toContain('beb19e7');
    expect(body).toContain('improved');
    expect(branchName('abcdef12-0000')).toBe('improvement/abcdef12');
  });
});
