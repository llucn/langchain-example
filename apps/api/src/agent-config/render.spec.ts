import { parseYaml, resolveString, resolveTree } from './render';

const run = (value: string, env = {}) => {
  const problems: string[] = [];
  return { out: resolveString(value, env, 'f', problems), problems };
};

describe('resolveString', () => {
  it('keeps the type of a whole-value placeholder', () => {
    expect(run('${env.N}', { N: 4096 }).out).toBe(4096);
    expect(run('${env.B}', { B: true }).out).toBe(true);
    expect(run('${env.S}', { S: 'x' }).out).toBe('x');
  });

  it('interpolates inside longer text and uses defaults', () => {
    expect(run('Model: ${env.M}, region ${env.R:eu}', { M: 'claude' }).out).toBe(
      'Model: claude, region eu',
    );
    expect(run('${env.N:4096}').out).toBe(4096);
  });

  it('escapes $${ as a literal placeholder', () => {
    expect(run('$${env.X} and ${env.A}', { A: '1' }).out).toBe('${env.X} and 1');
  });

  it('reports undefined variables and invalid placeholders', () => {
    expect(run('${env.NOPE}').problems).toEqual(['f: undefined variable env.NOPE']);
    expect(run('${foo}').problems[0]).toContain('invalid placeholder');
  });

  it('inserts values with YAML special characters verbatim', () => {
    expect(run('${env.V}', { V: 'a: b # c' }).out).toBe('a: b # c');
  });
});

describe('parseYaml / resolveTree', () => {
  it('parses unquoted placeholders as valid YAML and resolves after parsing', () => {
    const tree = parseYaml('model: ${env.M}\nmaxTokens: ${env.N}\nlist:\n  - ${env.M}\n');
    const problems: string[] = [];
    expect(resolveTree(tree, { M: 'm', N: 5 }, 'a.yml', problems)).toEqual({
      model: 'm',
      maxTokens: 5,
      list: ['m'],
    });
    expect(problems).toEqual([]);
  });

  it('rejects duplicate keys', () => {
    expect(() => parseYaml('a: 1\na: 2\n')).toThrow();
  });
});
