import type { Diagnosis, ImprovementReplay, ReplayVerdictKind } from '@app/shared';

export const pullRequestTitle = (agentName: string) =>
  `Improve ${agentName} config from reviewed conversations`;

export const commitMessage = (agentName: string, proposalId: string) =>
  `Improve ${agentName} config (improvement proposal ${proposalId.slice(0, 8)})`;

export const branchName = (proposalId: string) => `improvement/${proposalId.slice(0, 8)}`;

const ORDER: Record<ReplayVerdictKind, number> = {
  regressed: 0,
  improved: 1,
  same: 2,
  inconclusive: 3,
};

const line = (r: ImprovementReplay) =>
  r.error
    ? `- Review ${r.reviewId.slice(0, 8)} (${r.kind}): replay failed: ${r.error}`
    : `- Review ${r.reviewId.slice(0, 8)} (${r.kind}): **${r.verdict?.verdict ?? 'n/a'}**${r.verdict ? ` - ${r.verdict.reason}` : ''}`;

/** Replay results as a list, regressions first. */
export function replaySummary(replays: ImprovementReplay[]): string {
  if (!replays.length) return 'No replay results.';
  const sorted = [...replays].sort(
    (a, b) =>
      (a.verdict ? ORDER[a.verdict.verdict] : 4) - (b.verdict ? ORDER[b.verdict.verdict] : 4),
  );
  const regressed = sorted.filter((r) => r.verdict?.verdict === 'regressed');
  return [
    regressed.length
      ? `**${regressed.length} regression${regressed.length === 1 ? '' : 's'} found.**`
      : '',
    ...sorted.map(line),
    '',
    '_Each side was run once; replays used recorded MCP results and executed no tool._',
  ]
    .filter((l, i) => l !== '' || i > 0)
    .join('\n');
}

export interface PullRequestInput {
  proposalId: string;
  agentName: string;
  rationale: string;
  baseCommit: string;
  reviewIds: string[];
  diagnoses: { reviewId: string; diagnosis: Diagnosis | null }[];
  replays: ImprovementReplay[];
}

export function pullRequestBody(i: PullRequestInput): string {
  return [
    `Proposed by improvement proposal \`${i.proposalId}\` for agent \`${i.agentName}\`, computed against config commit \`${i.baseCommit.slice(0, 7)}\`. Review the diff before merging; nothing was merged or released automatically.`,
    '## Rationale',
    i.rationale || '_none_',
    '## Reviews',
    ...i.diagnoses.map(
      (d) =>
        `- ${d.reviewId}: ${d.diagnosis ? `${d.diagnosis.layer} - ${d.diagnosis.rootCause}` : 'not diagnosed'}`,
    ),
    '## Replay',
    replaySummary(i.replays),
  ].join('\n\n');
}
