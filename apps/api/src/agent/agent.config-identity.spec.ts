import { sampleAgentConfig } from '../agent-config/sample-config';
import { agentConfigIdentity } from './agent.config-identity';

describe('agentConfigIdentity', () => {
  const config = sampleAgentConfig();

  it('carries the config version and commit hash, the same for every agent', () => {
    const a = agentConfigIdentity(config, 'selector');
    expect(a.version).toBe(config.version);
    expect(a.hash).toBe(config.hash);
    expect(agentConfigIdentity(config, 'other')).toEqual(
      expect.objectContaining({ agentName: 'other', hash: a.hash, version: a.version }),
    );
  });

  it('holds the rendered definition of the agent', () => {
    const { definition } = agentConfigIdentity(config, 'other');
    expect(definition.systemPrompt).toBe(config.agents.other.systemPrompt);
    expect(definition.maxTokens).toBe(4096);
  });

  it('resolves unknown names to the selector', () => {
    expect(agentConfigIdentity(config, 'billing').agentName).toBe('selector');
  });
});
