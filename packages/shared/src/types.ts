export type ServiceStatus = 'up' | 'down';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    database: ServiceStatus;
    redis: ServiceStatus;
  };
}

export interface UserProfile {
  sub: string;
  email?: string;
  username?: string;
  groups?: string[];
}

export type ChatRole = 'user' | 'assistant';

export interface ChatSession {
  id: string;
  /** First user message; null until the first message is sent. */
  name: string | null;
  startedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  /** Thinking process; only set on assistant messages. */
  thinking: string | null;
  createdAt: string;
}

export interface SendChatMessageRequest {
  content: string;
}

/** Server-sent events emitted while a message is processed. */
export type ChatStreamEvent =
  | { type: 'user'; message: ChatMessage }
  | { type: 'thinking'; delta: string }
  | { type: 'assistant'; message: ChatMessage }
  | { type: 'session'; session: ChatSession };
