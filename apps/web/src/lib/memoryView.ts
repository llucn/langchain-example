import { MEMORY_MAX_LENGTH } from '@app/shared';

/** Pages of an admin list; at least one so an empty list still shows page 1 of 1. */
export const pageCount = (total: number, pageSize: number) =>
  Math.max(1, Math.ceil(total / pageSize));

/** Why a draft cannot be saved, or null when it can. */
export const draftProblem = (draft: string): string | null => {
  const clean = draft.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Write something to remember';
  if (clean.length > MEMORY_MAX_LENGTH) return `At most ${MEMORY_MAX_LENGTH} characters`;
  return null;
};
