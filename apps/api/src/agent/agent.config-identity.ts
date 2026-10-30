import { createHash } from 'node:crypto';
import { AGENTS, type AgentDefinition, type AgentName } from './agent.config';

/**
 * Identifies the exact definition an agent ran with. `hash` is the SHA-256 of the definition
 * without its `version` label (so a prompt edit without a version bump is still detected); when
 * the Agent Config moves to a Git repository this becomes the commit ID.
 */
export interface AgentConfigIdentity {
  agentName: AgentName;
  version: string;
  hash: string;
  definition: Record<string, unknown>;
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;

const cache = new Map<AgentName, AgentConfigIdentity>();

export function agentConfigIdentity(name: AgentName): AgentConfigIdentity {
  let identity = cache.get(name);
  if (!identity) {
    const { version, ...rest } = AGENTS[name] as AgentDefinition;
    const definition = canonical(rest) as Record<string, unknown>;
    identity = {
      agentName: name,
      version,
      hash: createHash('sha256').update(JSON.stringify(definition)).digest('hex'),
      definition,
    };
    cache.set(name, identity);
  }
  return identity;
}
