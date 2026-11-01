import { LOCAL_TOOL_NAMES } from '../agent/tools';
import type { ConfigFiles } from '../agent-config/agent-config.types';
import { SAMPLE_CONFIG_DIR } from '../agent-config/sample-config';
import { readLocalConfig } from '../agent-config/source';
import { changedPaths, checkConfigChange } from './config-change.checker';

const base = (): ConfigFiles => structuredClone(readLocalConfig(SAMPLE_CONFIG_DIR).files);
const identity = { hash: 'h', version: 'v', source: 's' };

const check = (
  proposed: ConfigFiles,
  over: Partial<Parameters<typeof checkConfigChange>[0]> = {},
) =>
  checkConfigChange({
    base: base(),
    proposed,
    allowedAgents: new Set(['fault_report']),
    allowSettings: false,
    knownLocalTools: LOCAL_TOOL_NAMES,
    identity,
    ...over,
  });

describe('checkConfigChange', () => {
  it('accepts an unchanged config', () => {
    expect(check(base())).toEqual([]);
  });

  it('accepts a prompt-only change of a diagnosed agent', () => {
    const p = base();
    p.agents.fault_report = p.agents.fault_report.replace('Answer concisely', 'Be brief');
    expect(check(p)).toEqual([]);
    expect(changedPaths(base(), p)).toEqual(['agents/fault_report.yml']);
  });

  it('rejects a change to an agent outside the diagnosis', () => {
    const p = base();
    p.agents.other = `${p.agents.other}\n`;
    expect(check(p).join()).toContain('agents/other.yml');
  });

  it('allows the selector for a routing diagnosis', () => {
    const p = base();
    p.agents.selector = p.agents.selector.replace('Clarify before routing', 'Clarify first');
    expect(check(p, { allowedAgents: new Set(['selector']) })).toEqual([]);
  });

  it('rejects a change of the model key', () => {
    const p = base();
    p.agents.fault_report = p.agents.fault_report.replace(
      'model: ${env.AGENT_MODEL}',
      'model: other-model',
    );
    expect(check(p).join()).toContain('`model` must not change');
  });

  it('rejects an MCP server URL change', () => {
    const p = base();
    p.configYml = p.configYml.replace(
      "work_order: 'https://d2vyv1n4ekgnt0.cloudfront.net/api/mcp/work-order'",
      "work_order: 'https://evil.example/mcp'",
    );
    expect(check(p, { allowSettings: true }).join()).toContain('`mcpServers` must not change');
  });

  it('rejects a settings change without a settings diagnosis, accepts it with one', () => {
    const p = base();
    p.configYml = p.configYml.replace('recursionLimit: 10', 'recursionLimit: 20');
    expect(check(p).join()).toContain('`settings`');
    expect(check(p, { allowSettings: true })).toEqual([]);
  });

  it('rejects a tool of an undeclared MCP server', () => {
    const p = base();
    p.agents.fault_report = p.agents.fault_report.replace(
      '  - type: mcp\n    server: user',
      '  - type: mcp\n    server: nowhere\n  - type: mcp\n    server: user',
    );
    expect(check(p).join()).toContain('`nowhere` is not in mcpServers');
  });

  it('rejects invalid YAML', () => {
    const p = base();
    p.agents.fault_report = 'model: [unclosed';
    expect(check(p).length).toBeGreaterThan(0);
  });

  it('rejects added or removed agent files', () => {
    const p = base();
    p.agents.extra = p.agents.other;
    expect(check(p).join()).toContain('added or removed');
  });

  it('rejects a config the validation refuses', () => {
    const p = base();
    p.agents.fault_report = p.agents.fault_report.replace(
      'maxTokens: ${env.AGENT_MAX_TOKENS}',
      'maxTokens: -1',
    );
    expect(check(p).join()).toContain('maxTokens');
  });
});
