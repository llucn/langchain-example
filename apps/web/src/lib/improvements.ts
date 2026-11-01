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
