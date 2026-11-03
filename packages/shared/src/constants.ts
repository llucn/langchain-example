export const API_PREFIX = 'api';
export const DEFAULT_API_PORT = 3000;
export const DEFAULT_WEB_PORT = 4200;

export const CHAT_LOG_MESSAGE_TYPES = [
  'user_input',
  'llm_tool_use',
  'llm_end_turn',
  'agent_tool_result',
  'run_error',
] as const;

export const REVIEW_RATINGS = ['good', 'bad'] as const;

/** Fixed vocabulary of failure causes, so reviews can be counted by cause later. */
export const REVIEW_TAGS = [
  'wrong_routing',
  'wrong_tool',
  'bad_tool_args',
  'hallucination',
  'incomplete',
  'wrong_language',
  'tone',
  'too_verbose',
  'stop_condition',
  'missing_capability',
  'other',
] as const;

export const CHAT_LOG_REVIEW_STATES = ['unreviewed', 'good', 'bad'] as const;

/** Root-cause layers of a diagnosed Bad review (see the `improvement-proposals` capability). */
export const DIAGNOSIS_LAYERS = [
  'prompt',
  'tool_missing',
  'tool_config',
  'settings',
  'routing',
  'label_unclear',
  'insufficient_evidence',
] as const;

export const IMPROVEMENT_STATUSES = [
  'generating',
  'ready',
  'failed',
  'discarded',
  'published',
] as const;

export const REPLAY_VERDICTS = ['improved', 'same', 'regressed', 'inconclusive'] as const;

/** `target`: a Bad review the proposal answers; `regression`: a Good review that must stay good. */
export const REPLAY_KINDS = ['target', 'regression'] as const;

/** Most Bad reviews one generation takes. */
export const MAX_IMPROVEMENT_REVIEWS = 10;

/** Characters of one memory (longer ones are rejected). */
export const MEMORY_MAX_LENGTH = 500;
/** Memories one user may have; `saveMemory` deletes the oldest when it is reached. */
export const MEMORY_MAX_PER_USER = 200;
