import type { AgentConfigService } from '../agent-config/agent-config.service';

/**
 * Identifies the exact definition an agent ran with: the Agent Config's `version` (`CONFIG_REF`)
 * and `hash` (the commit ID), plus the agent's rendered definition. `(agentName, hash)` is the key
 * of the stored snapshot row.
 */
export interface AgentConfigIdentity {
  agentName: string;
  version: string;
  hash: string;
  definition: Record<string, unknown>;
}

export function agentConfigIdentity(config: AgentConfigService, name: string): AgentConfigIdentity {
  const agentName = config.resolveAgent(name);
  return {
    agentName,
    version: config.version,
    hash: config.hash,
    definition: config.definition(agentName) as unknown as Record<string, unknown>,
  };
}
