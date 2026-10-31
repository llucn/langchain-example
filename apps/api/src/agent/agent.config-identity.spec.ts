import { AGENTS } from './agent.config';
import { agentConfigIdentity } from './agent.config-identity';

describe('agentConfigIdentity', () => {
  it('is a stable SHA-256 per agent and carries the version label', () => {
    const a = agentConfigIdentity('selector');
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(agentConfigIdentity('selector').hash).toBe(a.hash);
    expect(a.version).toBe(AGENTS.selector.version);
    expect(agentConfigIdentity('other').hash).not.toBe(a.hash);
  });

  it('hashes the content, not the version label', () => {
    const { definition } = agentConfigIdentity('other');
    expect(definition).not.toHaveProperty('version');
    expect(definition.systemPrompt).toBe(AGENTS.other.systemPrompt);
  });
});
