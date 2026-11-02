import { sampleAgentConfig } from './sample-config';

describe('AgentConfigService hot refresh', () => {
  it('replace swaps the config; a snapshot keeps the one it was taken from', () => {
    const live = sampleAgentConfig();
    const old = live.config;
    const before = live.snapshot();
    const next = { ...old, hash: 'next', version: 'v2' };
    live.replace(next);
    expect(live.hash).toBe('next');
    expect(live.version).toBe('v2');
    expect(before.hash).toBe(old.hash);
    expect(live.snapshot().hash).toBe('next');
  });
});
