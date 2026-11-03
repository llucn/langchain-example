import type { AdminMemoryPage, Memory } from '@app/shared';
import { apiFetch, apiRequest } from './api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** The API's reason for a refusal (400 carries it), else the status. */
async function failure(res: Response): Promise<Error> {
  let reason = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) reason = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  } catch {
    // keep the status text
  }
  return new Error(reason);
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await apiRequest(path, {
    method,
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const listMemories = () => apiFetch<Memory[]>('/memories');
export const addMemory = (content: string) => send<Memory>('/memories', 'POST', { content });
export const editMemory = (id: string, content: string) =>
  send<Memory>(`/memories/${id}`, 'PATCH', { content });
export const deleteMemory = (id: string) => send<void>(`/memories/${id}`, 'DELETE');

export const listAllMemories = (email: string, page: number, pageSize: number) => {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (email.trim()) q.set('email', email.trim());
  return apiFetch<AdminMemoryPage>(`/admin/memories?${q}`);
};
export const editAnyMemory = (id: string, content: string) =>
  send<Memory>(`/admin/memories/${id}`, 'PATCH', { content });
export const deleteAnyMemory = (id: string) => send<void>(`/admin/memories/${id}`, 'DELETE');
