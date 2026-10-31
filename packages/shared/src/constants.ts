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
  'other',
] as const;

export const CHAT_LOG_REVIEW_STATES = ['unreviewed', 'good', 'bad'] as const;
