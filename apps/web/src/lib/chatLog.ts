import type {
  ChatLogReview,
  ChatLogSessionDetail,
  ChatLogSessionPage,
  ChatLogSessionQuery,
  SaveChatLogReviewRequest,
} from '@app/shared';
import { apiFetch, apiRequest } from './api';

const BASE = '/admin/chat-logs';

export function listLogSessions(query: ChatLogSessionQuery): Promise<ChatLogSessionPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));
  return apiFetch<ChatLogSessionPage>(`${BASE}/sessions?${params}`);
}

export const getLogSession = (id: string) =>
  apiFetch<ChatLogSessionDetail>(`${BASE}/sessions/${id}`);

const json = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const saveSessionReview = (id: string, review: SaveChatLogReviewRequest) =>
  apiFetch<ChatLogReview>(`${BASE}/sessions/${id}/review`, json(review));

export const saveMessageReview = (id: string, review: SaveChatLogReviewRequest) =>
  apiFetch<ChatLogReview>(`${BASE}/messages/${id}/review`, json(review));

async function remove(path: string): Promise<void> {
  const res = await apiRequest(path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export const deleteSessionReview = (id: string) => remove(`${BASE}/sessions/${id}/review`);
export const deleteMessageReview = (id: string) => remove(`${BASE}/messages/${id}/review`);
