import { AgentConfigError } from './agent-config.error';
import { parseSource } from './source';

describe('parseSource', () => {
  it('splits repository and sub-path', () => {
    expect(parseSource('https://github.com/llucn/config.git//langchain-example')).toEqual({
      kind: 'github',
      host: 'github.com',
      owner: 'llucn',
      repo: 'config',
      subPath: 'langchain-example',
      apiBase: 'https://api.github.com',
      display: 'https://github.com/llucn/config//langchain-example',
    });
  });

  it('uses the repository root without a sub-path and trims slashes', () => {
    expect(parseSource('https://github.com/o/r')).toEqual(
      expect.objectContaining({ subPath: '', display: 'https://github.com/o/r' }),
    );
    expect(parseSource('https://github.com/o/r//a/b/')).toEqual(
      expect.objectContaining({ subPath: 'a/b' }),
    );
  });

  it('derives the Enterprise API base and honours an override', () => {
    expect(parseSource('https://ghe.example.com/o/r')).toEqual(
      expect.objectContaining({ apiBase: 'https://ghe.example.com/api/v3' }),
    );
    expect(parseSource('https://github.com/o/r', 'http://127.0.0.1:9/')).toEqual(
      expect.objectContaining({ apiBase: 'http://127.0.0.1:9' }),
    );
  });

  it('treats other values as local directories', () => {
    expect(parseSource('docs/config-sample')).toEqual(expect.objectContaining({ kind: 'local' }));
  });

  it.each([
    'http://github.com/o/r',
    'https://user:pw@github.com/o/r',
    'https://token@github.com/o/r',
    'https://github.com/o',
    'https://github.com/o/r/extra',
  ])('rejects %s', (url) => {
    expect(() => parseSource(url)).toThrow(AgentConfigError);
  });
});
