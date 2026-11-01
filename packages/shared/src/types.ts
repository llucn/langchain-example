import type {
  CHAT_LOG_MESSAGE_TYPES,
  CHAT_LOG_REVIEW_STATES,
  DIAGNOSIS_LAYERS,
  IMPROVEMENT_STATUSES,
  REPLAY_KINDS,
  REPLAY_VERDICTS,
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

export type DiagnosisLayer = (typeof DIAGNOSIS_LAYERS)[number];
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

export interface Diagnosis {
  layer: DiagnosisLayer;
  rootCause: string;
  /** Event sequence numbers and short quotes that support the root cause. */
  evidence: string[];
  /** 0 to 1. */
  confidence: number;
  suggestedAction: string;
}

/** One logged event as shown to the evolution agents. */
export interface CaseEvent {
  seq: number;
  type: ChatLogMessageType;
  agentName: string | null;
  content: string;
  toolName: string | null;
  toolCallId: string | null;
  toolCalls: ChatLogToolCall[] | null;
  status: 'ok' | 'error';
}

/** What a case is built from; stored with the case so the proposal stays explainable. */
export interface CaseEvidence {
  reviewedSeq: number;
  agentName: string;
  configHash: string | null;
  configVersion: string | null;
  /** Definition of the agent in the config commit the event ran under; null when unknown. */
  definition: Record<string, unknown> | null;
  /** Global settings of that commit. */
  settings: Record<string, unknown> | null;
  review: {
    tags: ReviewTag[];
    comment: string | null;
    expectedResult: string | null;
    reviewerName: string | null;
  };
  /** Final answers and user inputs of the turns before the reviewed one. */
  history: Pick<CaseEvent, 'seq' | 'type' | 'content'>[];
  /** The reviewed turn up to and including the reviewed event. */
  turn: CaseEvent[];
}

export interface ImprovementCase {
  id: string;
  reviewId: string;
  evidence: CaseEvidence;
  diagnosis: Diagnosis | null;
}

export interface ImprovementFile {
  /** Path inside the config directory, e.g. `agents/fault_report.yml`. */
  path: string;
  base: string;
  proposed: string;
}

export type ReplayVerdictKind = (typeof REPLAY_VERDICTS)[number];
export type ReplayKind = (typeof REPLAY_KINDS)[number];

/** A tool call the replayed agent made; `unrecorded` calls were not executed (see `config-replay`). */
export interface ReplayCall {
  name: string;
  args: unknown;
  unrecorded: boolean;
}

export interface ReplayOutput {
  /** Final answer of the replayed turn. */
  text: string;
  /** Agent that was active at the end of the turn. */
  agent: string;
  /** Ordered tool calls of the whole turn, local and MCP. */
  toolCalls: ReplayCall[];
}

export interface ReplayVerdict {
  verdict: ReplayVerdictKind;
  reason: string;
}

/** Old and new output of one replayed review, each side run once, with the judge's verdict. */
export interface ImprovementReplay {
  id: string;
  reviewId: string;
  kind: ReplayKind;
  old: ReplayOutput | null;
  new: ReplayOutput | null;
  verdict: ReplayVerdict | null;
  error: string | null;
}

export interface ImprovementProposalSummary {
  id: string;
  agentName: string;
  status: ImprovementStatus;
  baseCommit: string;
  createdByName: string | null;
  caseCount: number;
  hasDiff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ImprovementProposal extends Omit<ImprovementProposalSummary, 'caseCount'> {
  baseSource: string;
  files: ImprovementFile[];
  diff: string;
  rationale: string;
  notes: string[];
  error: string | null;
  /** False when the MCP tool inventory could not be read, so tool diagnoses were not possible. */
  inventoryAvailable: boolean;
  /** The config files changed on the default branch since the proposal was computed. */
  stale: boolean;
  /** Branch and pull request once published. */
  branch: string | null;
  prUrl: string | null;
  /** "Create pull request" is possible: GitHub source, token, ready, with a diff, not stale. */
  publishAvailable: boolean;
  cases: ImprovementCase[];
  replays: ImprovementReplay[];
}

export interface CreateImprovementRequest {
  reviewIds: string[];
}
