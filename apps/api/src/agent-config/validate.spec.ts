import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AgentConfigError } from './agent-config.error';
import type { ConfigFiles } from './agent-config.types';
import { SAMPLE_CONFIG_DIR, loadSampleConfig } from './sample-config';
import { readLocalConfig } from './source';
import { assembleConfig } from './validate';

const id = { hash: 'h', version: 'v', source: 's' };
const TOOLS = ['renameSession', 'selectAgent', 'saveMemory', 'forgetMemory'];
const agent = (extra = '') =>
  `model: m\nmaxTokens: 10\nthinking:\n  type: adaptive\noutputConfig:\n  effort: low\ntools: []\nsystemPrompt: p\n${extra}`;
const files = (over: Partial<ConfigFiles> = {}): ConfigFiles => ({
  configYml: 'env: {}\n',
  agents: { selector: agent(), other: agent() },
  ...over,
});
const problems = (f: ConfigFiles) => {
  try {
    assembleConfig(f, id, TOOLS);
  } catch (err) {
    return (err as AgentConfigError).problems;
  }
  return [];
};

describe('assembleConfig', () => {
  it('loads the sample: four agents with resolved variables', () => {
    const c = loadSampleConfig();
    expect(Object.keys(c.agents).sort()).toEqual([
      'fault_report',
      'other',
      'selector',
      'work_order_inquiry',
    ]);
    expect(c.agents.other).toEqual(
      expect.objectContaining({ model: 'claude-sonnet-5-5', maxTokens: 4096 }),
    );
    expect(c.agents.other.outputConfig.effort).toBe('medium');
    expect(c.agents.selector.outputConfig.effort).toBe('low');
    expect(Object.keys(c.mcpServers)).toEqual(['user', 'asset', 'location', 'work_order']);
  });

  it('defaults the settings', () => {
    expect(assembleConfig(files(), id, TOOLS).settings).toEqual({
      maxContextMessages: 20,
      recursionLimit: 10,
      selector: { maxTurns: 5, minConfidence: 0.5 },
      memory: { enabled: true, maxMemories: 30 },
    });
  });

  it('reads the memory settings and rejects a bad maxMemories', () => {
    const memory = (yml: string) => files({ configYml: `settings:\n  memory:\n${yml}` });
    expect(
      assembleConfig(memory('    enabled: false\n    maxMemories: 10\n'), id, TOOLS).settings
        .memory,
    ).toEqual({ enabled: false, maxMemories: 10 });
    for (const bad of ['    maxMemories: 0\n', '    maxMemories: 1.5\n'])
      expect(() => assembleConfig(memory(bad), id, TOOLS)).toThrow(/maxMemories/);
  });

  it('skips MCP servers with an empty URL and keeps the others', () => {
    const c = assembleConfig(
      files({ configYml: "mcpServers:\n  a: ''\n  b: 'http://b'\n" }),
      id,
      TOOLS,
    );
    expect(c.mcpServers).toEqual({ b: 'http://b' });
  });

  it('keeps the model block', () => {
    const c = assembleConfig(
      files({ configYml: 'model:\n  baseUrl: http://x\n  apiKey: k\n' }),
      id,
      TOOLS,
    );
    expect(c.model).toEqual({ baseUrl: 'http://x', apiKey: 'k' });
  });

  it('reports an undefined variable with file and name', () => {
    expect(
      problems(
        files({
          agents: { selector: agent().replace('model: m', 'model: ${env.NOPE}'), other: agent() },
        }),
      ),
    ).toEqual(['agents/selector.yml: undefined variable env.NOPE (at model)']);
  });

  it('does not take variables from the process environment', () => {
    process.env.AGENT_ONLY_IN_PROCESS = 'x';
    const f = files({
      agents: {
        selector: agent().replace('model: m', 'model: ${env.AGENT_ONLY_IN_PROCESS}'),
        other: agent(),
      },
    });
    expect(problems(f)[0]).toContain('undefined variable env.AGENT_ONLY_IN_PROCESS');
    delete process.env.AGENT_ONLY_IN_PROCESS;
  });

  it('rejects unknown local tools and undeclared MCP servers', () => {
    const bad = agent().replace(
      'tools: []',
      'tools:\n  - {type: local, name: fooBar}\n  - {type: mcp, server: billing}',
    );
    expect(problems(files({ agents: { selector: bad, other: agent() } }))).toEqual([
      'agents/selector.yml: unknown local tool `fooBar`',
      'agents/selector.yml: MCP server `billing` is not in mcpServers',
    ]);
  });

  it('requires selector and other', () => {
    expect(problems(files({ agents: { other: agent() } }))).toEqual([
      'agents/selector.yml: the agent `selector` is required',
    ]);
  });

  it('rejects unknown keys, bad values and duplicate keys, reporting all files together', () => {
    const out = problems(
      files({
        agents: {
          selector: agent('extra: 1\n'),
          other: agent().replace('maxTokens: 10', 'maxTokens: -1'),
          third: 'a: 1\na: 2\n',
        },
      }),
    );
    expect(out.some((p) => p.startsWith('agents/selector.yml'))).toBe(true);
    expect(out.some((p) => p.startsWith('agents/other.yml: maxTokens'))).toBe(true);
    expect(out.some((p) => p.startsWith('agents/third.yml'))).toBe(true);
  });

  it('rejects bad agent names and an invalid config.yml', () => {
    expect(
      problems(files({ agents: { selector: agent(), other: agent(), 'Bad-Name': agent() } })),
    ).toEqual([expect.stringContaining('agents/Bad-Name.yml: agent name')]);
    expect(problems(files({ configYml: 'settings:\n  recursionLimit: 0\n' }))[0]).toContain(
      'config.yml',
    );
  });
});

describe('readLocalConfig', () => {
  it('hashes the content', () => {
    const a = readLocalConfig(SAMPLE_CONFIG_DIR);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(readLocalConfig(SAMPLE_CONFIG_DIR).hash).toBe(a.hash);
    expect(a.files.configYml).toBe(readFileSync(join(SAMPLE_CONFIG_DIR, 'config.yml'), 'utf8'));
  });

  it('fails without config.yml', () => {
    expect(() => readLocalConfig(join(SAMPLE_CONFIG_DIR, 'agents'))).toThrow(AgentConfigError);
  });
});
