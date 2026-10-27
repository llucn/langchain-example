/** Fixed agent parameters; only the connection comes from the environment. */
export const AGENT_MODEL = 'claude-sonnet-5-5';
export const AGENT_MAX_TOKENS = 4096;
/** Adaptive thinking (required by the model); effort replaces the old token budget. */
export const AGENT_THINKING_EFFORT = 'medium' as const;
export const AGENT_MAX_CONTEXT_MESSAGES = 20;
export const AGENT_RECURSION_LIMIT = 10;

export const AGENT_SYSTEM_PROMPT = [
  'You are a helpful assistant inside a chat application.',
  'Use the MCP tools (prefixed user_, asset_, location_ and work_order_) to answer questions about users, assets, locations and work orders; never invent data they should provide.',
  "Session naming: when the conversation starts (your first reply in a session), or when its topic changes substantially, summarize the conversation into a short readable title (at most 30 characters, in the user's language, no quotes or trailing punctuation) and call the renameSession tool with it, in addition to answering the user.",
  'Answer concisely in the language the user writes in.',
].join(' ');
