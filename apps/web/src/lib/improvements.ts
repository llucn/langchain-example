import type {
  CreateImprovementRequest,
  ImprovementProposal,
  ImprovementProposalSummary,
} from '@app/shared';
import { apiFetch, apiRequest } from './api';

const BASE = '/admin/improvements';

export const createImprovements = (body: CreateImprovementRequest) =>
  apiFetch<{ ids: string[] }>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const listImprovements = () => apiFetch<ImprovementProposalSummary[]>(BASE);

export const getImprovement = (id: string) => apiFetch<ImprovementProposal>(`${BASE}/${id}`);

export async function discardImprovement(id: string): Promise<void> {
  const res = await apiRequest(`${BASE}/${id}/discard`, { method: 'POST' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

/** Opens the pull request; a refusal carries the API's reason (stale, not available, no permission). */
export async function publishImprovement(id: string): Promise<{ branch: string; prUrl: string }> {
  const res = await apiRequest(`${BASE}/${id}/publish`, { method: 'POST' });
  if (res.ok) return (await res.json()) as { branch: string; prUrl: string };
  let reason = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) reason = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  } catch {
    // keep the status text
  }
  throw new Error(reason);
}
