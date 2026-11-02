import {
  MAX_IMPROVEMENT_REVIEWS,
  type ChatLogReview,
  type DiagnosisLayer,
  type ImprovementReplay,
  type ImprovementStatus,
  type ReplayVerdictKind,
} from '@app/shared';

/** Only Bad reviews of a message can be turned into an improvement proposal. */
export const canSelectForImprovement = (r: ChatLogReview) =>
  r.rating === 'bad' && r.messageId !== null;

/** Adds or removes an id; refuses to grow beyond the most reviews one generation takes. */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string,
  max = MAX_IMPROVEMENT_REVIEWS,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else if (next.size < max) next.add(id);
  return next;
}

/** A proposal that is still being generated is polled until it settles. */
export const isGenerating = (status: ImprovementStatus) => status === 'generating';

export const canDiscard = (status: ImprovementStatus) => status === 'ready' || status === 'failed';

export const shortCommit = (hash: string) => hash.slice(0, 7);

export const LAYER_LABEL: Record<DiagnosisLayer, string> = {
  prompt: 'Prompt',
  tool_missing: 'Tool missing',
  tool_config: 'Tool config',
  settings: 'Settings',
  routing: 'Routing',
  label_unclear: 'Label unclear',
  insufficient_evidence: 'Insufficient evidence',
};

/** Drops selected ids whose review is no longer a selectable Bad review. */
export function pruneSelection(
  selected: ReadonlySet<string>,
  reviews: ChatLogReview[],
): Set<string> {
  const ok = new Set(reviews.filter(canSelectForImprovement).map((r) => r.id));
  const mine = new Set(reviews.map((r) => r.id));
  // Ids from other sessions stay; ids of this session that stopped being Bad go.
  return new Set([...selected].filter((id) => !mine.has(id) || ok.has(id)));
}

/** Classifies one unified-diff line for coloring. */
export function diffLineKind(line: string): 'add' | 'del' | 'hunk' | 'meta' | 'ctx' {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

export const VERDICT_COLOR: Record<ReplayVerdictKind, string> = {
  improved: 'var(--green)',
  same: 'var(--muted)',
  regressed: 'var(--red)',
  inconclusive: 'var(--muted2)',
};

const VERDICT_ORDER: Record<ReplayVerdictKind, number> = {
  regressed: 0,
  improved: 1,
  same: 2,
  inconclusive: 3,
};

/** Replays with regressions first, then by verdict; a failed replay (no verdict) goes last. */
export const sortReplays = (replays: ImprovementReplay[]): ImprovementReplay[] =>
  [...replays].sort(
    (a, b) =>
      (a.verdict ? VERDICT_ORDER[a.verdict.verdict] : 4) -
      (b.verdict ? VERDICT_ORDER[b.verdict.verdict] : 4),
  );

export const regressionCount = (replays: ImprovementReplay[]) =>
  replays.filter((r) => r.verdict?.verdict === 'regressed').length;

/** One line of the replay summary shown in the pull request dialog. */
export function replayTally(replays: ImprovementReplay[]): string {
  if (!replays.length) return 'No replay results.';
  const count = (v: ReplayVerdictKind) => replays.filter((r) => r.verdict?.verdict === v).length;
  const failed = replays.filter((r) => r.error).length;
  const parts = [
    `${count('improved')} improved`,
    `${count('same')} same`,
    `${count('regressed')} regressed`,
    `${count('inconclusive')} inconclusive`,
  ];
  if (failed) parts.push(`${failed} failed`);
  return `${replays.length} replayed: ${parts.join(', ')}.`;
}
