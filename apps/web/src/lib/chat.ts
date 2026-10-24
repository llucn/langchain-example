import type { ChatMessage, ChatSession, ChatStreamEvent } from '@app/shared';
import { apiFetch, apiRequest } from './api';

export const listChatSessions = () => apiFetch<ChatSession[]>('/chat/sessions');

export const createChatSession = () => apiFetch<ChatSession>('/chat/sessions', { method: 'POST' });

export async function deleteChatSession(sessionId: string): Promise<void> {
  const res = await apiRequest(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

export const listChatMessages = (sessionId: string) =>
  apiFetch<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);

/** Sends a message and invokes `onEvent` for each server-sent event until the stream ends. */
export async function sendChatMessage(
  sessionId: string,
  content: string,
  onEvent: (e: ChatStreamEvent) => void,
): Promise<void> {
  const res = await apiRequest(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame.split('\n').find((l) => l.startsWith('data: '));
      if (data) onEvent(JSON.parse(data.slice(6)) as ChatStreamEvent);
    }
  }
}
