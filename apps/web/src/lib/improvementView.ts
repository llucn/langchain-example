import {
  MAX_IMPROVEMENT_REVIEWS,
  type ChatLogReview,
  type DiagnosisLayer,
  type ImprovementStatus,
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
