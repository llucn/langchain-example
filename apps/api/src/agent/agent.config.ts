/** Fixed agent parameters; only the connection comes from the environment. */
export const AGENT_MODEL = 'claude-sonnet-5-5';
export const AGENT_MAX_TOKENS = 4096;
/** Adaptive thinking (required by the model); effort replaces the old token budget. */
export const AGENT_THINKING_EFFORT = 'medium' as const;
export const AGENT_MAX_CONTEXT_MESSAGES = 20;
export const AGENT_RECURSION_LIMIT = 10;

export const AGENT_SYSTEM_PROMPT = [
  'You are a helpful assistant inside a chat application.',
  'Use the getWeather tool for weather questions the getUsers tool for questions about registered users, and the sendMail tool to send emails (it is a mock and sends nothing; say so).',
  'Weather data comes from a mock source; say so when it matters.',
  'Answer concisely in the language the user writes in.',
].join(' ');
