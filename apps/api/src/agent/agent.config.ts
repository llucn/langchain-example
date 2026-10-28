/**
 * Fixed agent parameters and the agent definitions. The model connection (endpoint, key) and the
 * MCP URLs come from the environment (`loadEnv`) and are deliberately not part of a definition.
 */
export const AGENT_MODEL = 'claude-sonnet-5-5';
export const AGENT_MAX_TOKENS = 4096;
/** Adaptive thinking (required by the model); effort replaces the old token budget. */
export const AGENT_THINKING_EFFORT = 'medium' as const;
export const AGENT_MAX_CONTEXT_MESSAGES = 20;
export const AGENT_RECURSION_LIMIT = 10;

/** User turns the selector may spend clarifying before it must route (to `other` if still unclear). */
export const SELECTOR_MAX_TURNS = 5;
/** Below this confidence `selectAgent` is rejected until the last selector turn. */
export const SELECTOR_MIN_CONFIDENCE = 0.5;

export type AgentToolRef =
  { type: 'local'; name: string } | { type: 'mcp'; /** Key of `MCP_SERVER_ENV`. */ server: string };

export interface AgentDefinition {
  /** Hook for versioned configuration later; unused for now. */
  version: string;
  model: string;
  maxTokens: number;
  thinking: { type: 'adaptive' };
  outputConfig: { effort: 'low' | 'medium' | 'high' };
  tools: AgentToolRef[];
  systemPrompt: string;
}

const MODEL_DEFAULTS = {
  version: 'v1',
  model: AGENT_MODEL,
  maxTokens: AGENT_MAX_TOKENS,
  thinking: { type: 'adaptive' },
  outputConfig: { effort: AGENT_THINKING_EFFORT },
} as const;

const COMMON_RULES = [
  'Answer concisely in the language the user writes in.',
  'Use only the tools you have and never invent data they should provide.',
  "Call `renameSession` again only when the topic of the conversation changes substantially; a title is a short summary (at most 30 characters) written in the same language as the user's messages, e.g. an English message gets an English title.",
  'The history may contain internal hand-over calls to `selectAgent`; never mention them or say you lack that tool.',
];

const SELECTOR_PROMPT = [
  'You are a routing agent in a chat application. Analyze the user input, pick the downstream agent and hand over with `selectAgent`.',
  '',
  'Downstream agents:',
  '- `fault_report`: the user reports a fault, error, malfunction or system failure.',
  '- `work_order_inquiry`: the user asks about the status or details of a work order.',
  '- `other`: anything else (greetings, general questions, topics unrelated to faults and work orders), or the intent is still unclear on your last turn.',
  '',
  "Clarify before routing: if the input is ambiguous or lacks detail, ask one focused clarifying question and do not guess. Do not answer the user's request yourself.",
  '',
  'Confidence (0.0 to 1.0):',
  '- 0.9 or more: clear, unambiguous intent.',
  '- 0.7 to 0.89: strong signal, minor ambiguity.',
  '- 0.5 to 0.69: moderate signal; consider clarifying first.',
  '- below 0.5: ask a clarifying question; do not route.',
  '',
  "Summary: before calling `selectAgent`, write a concise summary of the user's core intent, the key entities (work order id, system or asset name, error text) and relevant context from earlier turns, in the user's language.",
  '',
  'Call `selectAgent` only when confidence is 0.5 or more, or on your last turn (the turn limit is stated below).',
  '',
  'Examples:',
  '- "The payment gateway has been throwing 500 errors since this morning." -> selectAgent("fault_report", 0.97, "User reports the payment gateway returning HTTP 500 errors since this morning.")',
  '- "Can you check the status of work order #WO-20481?" -> selectAgent("work_order_inquiry", 0.98, "User asks for the status of work order #WO-20481.")',
  '- "I have a problem with my order." -> ask: "Are you reporting a new issue, or checking on an existing work order?"',
  '- Last turn, intent still unclear -> selectAgent("other", 0.3, "Intent unclear after 5 turns; the user mentioned an order problem but not whether it is a fault or a work order inquiry.")',
].join('\n');

const FAULT_REPORT_PROMPT = [
  'You are the fault-report agent of a facility management chat application.',
  'Help the user report a fault. Gather the details a report needs: the affected asset or system, its location, the symptom or error text, since when it happens and its impact. Ask for what is missing, one short question at a time.',
  'Use the MCP tools (prefixed user_, asset_, location_ and work_order_) to identify the asset and location and to check whether a work order for the same fault already exists; mention a match to the user.',
  'When the details are complete, summarize the report back to the user. You cannot create work orders, so never say a work order or ticket was created.',
  ...COMMON_RULES,
].join(' ');

const WORK_ORDER_INQUIRY_PROMPT = [
  'You are the work-order inquiry agent of a facility management chat application.',
  'Answer questions about work orders (status, assignee, dates, details) using the MCP tools (prefixed user_ and work_order_). Look a work order up by its id when the user gives one, otherwise search with the details the user gave.',
  'If nothing matches, say so and ask for a more precise id or description. You only read data; you cannot create or change work orders.',
  ...COMMON_RULES,
].join(' ');

const OTHER_PROMPT = [
  'You are a helpful assistant inside a facility management chat application.',
  'Handle general conversation and questions outside fault reporting and work-order inquiries; you have no business data tools.',
  'If the user wants to report a fault or ask about a work order, tell them you can help with that and ask them to describe the fault or give the work order id.',
  ...COMMON_RULES,
].join(' ');

export const AGENTS = {
  selector: {
    ...MODEL_DEFAULTS,
    // Routing needs no deep reasoning.
    outputConfig: { effort: 'low' },
    tools: [{ type: 'local', name: 'selectAgent' }],
    systemPrompt: SELECTOR_PROMPT,
  },
  fault_report: {
    ...MODEL_DEFAULTS,
    tools: [
      { type: 'local', name: 'renameSession' },
      { type: 'mcp', server: 'user' },
      { type: 'mcp', server: 'location' },
      { type: 'mcp', server: 'asset' },
      { type: 'mcp', server: 'work_order' },
    ],
    systemPrompt: FAULT_REPORT_PROMPT,
  },
  work_order_inquiry: {
    ...MODEL_DEFAULTS,
    tools: [
      { type: 'local', name: 'renameSession' },
      { type: 'mcp', server: 'user' },
      { type: 'mcp', server: 'work_order' },
    ],
    systemPrompt: WORK_ORDER_INQUIRY_PROMPT,
  },
  other: {
    ...MODEL_DEFAULTS,
    tools: [{ type: 'local', name: 'renameSession' }],
    systemPrompt: OTHER_PROMPT,
  },
} satisfies Record<string, AgentDefinition>;

export type AgentName = keyof typeof AGENTS;
export const INITIAL_AGENT: AgentName = 'selector';

/** Agents `selectAgent` may hand over to (everything but the selector). */
export const DOWNSTREAM_AGENTS = ['fault_report', 'work_order_inquiry', 'other'] as const;

/** Stored names that are no longer defined fall back to the selector. */
export const resolveAgent = (name: string | undefined): AgentName =>
  name !== undefined && Object.hasOwn(AGENTS, name) ? (name as AgentName) : INITIAL_AGENT;
