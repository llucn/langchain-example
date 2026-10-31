import type {
  CHAT_LOG_MESSAGE_TYPES,
  CHAT_LOG_REVIEW_STATES,
  REVIEW_RATINGS,
  REVIEW_TAGS,
} from './constants';

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
  /** Member of the configured admin group (always true when authentication is disabled). */
  isAdmin?: boolean;
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
  | { type: 'session'; session: ChatSession }
  | { type: 'error'; message: string };

export type ChatLogMessageType = (typeof CHAT_LOG_MESSAGE_TYPES)[number];
export type ReviewRating = (typeof REVIEW_RATINGS)[number];
export type ReviewTag = (typeof REVIEW_TAGS)[number];
export type ChatLogReviewState = (typeof CHAT_LOG_REVIEW_STATES)[number];

export interface ChatLogToolCall {
  id: string;
  name: string;
  args: unknown;
}

/** One logged session in the review list. */
export interface ChatLogSession {
  id: string;
  userSub: string | null;
  userName: string | null;
  appVersion: string;
  startedAt: string;
  name: string | null;
  deletedAt: string | null;
  eventCount: number;
  lastEventAt: string | null;
  agents: string[];
  goodCount: number;
  badCount: number;
}

export interface ChatLogMessage {
  id: string;
  sessionId: string;
  seq: number;
  turnId: string;
  type: ChatLogMessageType;
  userSub: string | null;
  agentName: string | null;
  agentConfigVersion: string | null;
  agentConfigHash: string | null;
  appVersion: string;
  model: string | null;
  content: string;
  truncated: boolean;
  thinking: string | null;
  toolCalls: ChatLogToolCall[] | null;
  toolName: string | null;
  toolCallId: string | null;
  status: 'ok' | 'error';
  errorMessage: string | null;
  startedAt: string | null;
  createdAt: string;
  durationMs: number | null;
  chatMessageId: string | null;
  metadata: Record<string, unknown>;
}

export interface ChatLogReview {
  id: string;
  sessionId: string;
  /** null = review of the whole session. */
  messageId: string | null;
  rating: ReviewRating;
  tags: ReviewTag[];
  comment: string | null;
  expectedResult: string | null;
  reviewerType: 'human' | 'llm';
  reviewerSub: string;
  reviewerName: string | null;
  evaluator: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatLogSessionDetail {
  session: ChatLogSession;
  messages: ChatLogMessage[];
  reviews: ChatLogReview[];
}

export interface ChatLogSessionPage {
  items: ChatLogSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChatLogSessionQuery {
  page?: number;
  pageSize?: number;
  user?: string;
  agent?: string;
  appVersion?: string;
  from?: string;
  to?: string;
  rating?: ChatLogReviewState;
}

export interface SaveChatLogReviewRequest {
  rating: ReviewRating;
  tags?: ReviewTag[];
  comment?: string;
  /** Message reviews only. */
  expectedResult?: string;
}
