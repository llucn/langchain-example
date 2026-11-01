import type {
  AgentDefinition,
  AgentSettings,
  LoadedAgentConfig,
  ModelConnection,
} from './agent-config.types';

/** Name of the agent every session starts with and the fallback for unknown stored names. */
export const INITIAL_AGENT = 'selector';

/** Read access to the Agent Config loaded at startup (immutable for the life of the process). */
export class AgentConfigService {
  constructor(readonly config: LoadedAgentConfig) {}

  get hash() {
    return this.config.hash;
  }
  get version() {
    return this.config.version;
  }
  get source() {
    return this.config.source;
  }
  get settings(): AgentSettings {
    return this.config.settings;
  }
  get mcpServers(): Record<string, string> {
    return this.config.mcpServers;
  }
  get model(): ModelConnection | undefined {
    return this.config.model;
  }
  get agents(): Record<string, AgentDefinition> {
    return this.config.agents;
  }

  has(name: string | undefined): name is string {
    return name !== undefined && Object.hasOwn(this.config.agents, name);
  }

  /** Stored names that are no longer defined fall back to the selector. */
  resolveAgent(name: string | undefined): string {
    return this.has(name) ? name : INITIAL_AGENT;
  }

  definition(name: string): AgentDefinition {
    return this.config.agents[this.resolveAgent(name)];
  }

  /** Agents `selectAgent` may hand over to: everything but the selector (`other` always exists). */
  downstreamAgents(): [string, ...string[]] {
    return Object.keys(this.config.agents).filter((n) => n !== INITIAL_AGENT) as [
      string,
      ...string[],
    ];
  }
}
