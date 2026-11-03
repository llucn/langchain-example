export type AgentToolRef =
  { type: 'local'; name: string } | { type: 'mcp'; /** Key of `mcpServers`. */ server: string };

export interface AgentDefinition {
  model: string;
  maxTokens: number;
  thinking: { type: 'adaptive' };
  outputConfig: { effort: 'low' | 'medium' | 'high' };
  tools: AgentToolRef[];
  systemPrompt: string;
}

export interface AgentSettings {
  /** Most recent chat messages sent to the model. */
  maxContextMessages: number;
  /** LangGraph steps one run may take. */
  recursionLimit: number;
  selector: {
    /** User turns the selector may spend clarifying before it must route. */
    maxTurns: number;
    /** Below this confidence `selectAgent` is rejected until the last selector turn. */
    minConfidence: number;
  };
  memory: {
    /** Inject memories into prompts and let `saveMemory` / `forgetMemory` write. */
    enabled: boolean;
    /** Newest memories of the user put into the system prompt. */
    maxMemories: number;
  };
}

export interface ModelConnection {
  baseUrl?: string;
  apiKey?: string;
}

/** The Agent Config of one commit, rendered and validated. Immutable at runtime. */
export interface LoadedAgentConfig {
  /** Commit ID (or the content hash of a local directory). */
  hash: string;
  /** `CONFIG_REF` (`local` for a local directory without a ref). */
  version: string;
  /** Repository URL + sub-path (no credentials) or the directory path. */
  source: string;
  agents: Record<string, AgentDefinition>;
  settings: AgentSettings;
  /** Server name -> URL (servers with an empty URL are already dropped). */
  mcpServers: Record<string, string>;
  model?: ModelConnection;
}

/** The files of a config tree as raw text. */
export interface ConfigFiles {
  configYml: string;
  /** File name without extension -> text. */
  agents: Record<string, string>;
}
