import type { ChatLogMessage, ChatLogReview } from '@app/shared';

export interface TurnGroup {
  turnId: string;
  events: ChatLogMessage[];
}

/** Groups events (ordered by seq) into turns, keeping the order of first appearance. */
export function groupByTurn(events: ChatLogMessage[]): TurnGroup[] {
  const turns: TurnGroup[] = [];
  const byId = new Map<string, TurnGroup>();
  for (const e of events) {
    let turn = byId.get(e.turnId);
    if (!turn) {
      turn = { turnId: e.turnId, events: [] };
      byId.set(e.turnId, turn);
      turns.push(turn);
    }
    turn.events.push(e);
  }
  return turns;
}

/** Reviews of one target: `messageId` null = the session itself. */
export const reviewsOf = (reviews: ChatLogReview[], messageId: string | null) =>
  reviews.filter((r) => r.messageId === messageId);

/** The review written by the given reviewer (`anonymous` when authentication is off). */
export const ownReview = (reviews: ChatLogReview[], messageId: string | null, sub: string) =>
  reviewsOf(reviews, messageId).find((r) => r.reviewerType === 'human' && r.reviewerSub === sub);

/** Replaces or adds a saved review in the list (one per reviewer and target). */
export function upsertReview(reviews: ChatLogReview[], saved: ChatLogReview): ChatLogReview[] {
  return reviews.some((r) => r.id === saved.id)
    ? reviews.map((r) => (r.id === saved.id ? saved : r))
    : [...reviews, saved];
}

/** Indents JSON text; anything that is not JSON is returned unchanged. */
export function prettyJson(text: string): string {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return text;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return text;
  }
}

export const formatDuration = (ms: number | null) =>
  ms === null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
