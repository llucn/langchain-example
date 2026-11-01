import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { create } from 'tar';
import { ConfigSourceError } from './agent-config.error';
import { GitHubClient } from './github';
import { parseSource, type GitHubSource } from './source';

const SHA = 'a'.repeat(40);
const TOKEN = 'ghp_secret_token_123';
const source = parseSource(
  'https://github.com/o/r//langchain-example',
  'http://api.test',
) as GitHubSource;

/** A `<owner>-<repo>-<sha>/…` tarball of the given files, as GitHub serves it. */
async function tarball(files: Record<string, string>): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'gh-tar-'));
  try {
    for (const [path, text] of Object.entries(files)) {
      const full = join(dir, `o-r-${SHA.slice(0, 7)}`, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) =>
      create({ gzip: true, cwd: dir }, [`o-r-${SHA.slice(0, 7)}`])
        .on('data', (c: Buffer) => chunks.push(c))
        .on('end', resolve)
        .on('error', reject),
    );
    return Buffer.concat(chunks);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Call {
  url: string;
  headers: Record<string, string>;
}
const stub = (
  handler: (url: string, headers: Record<string, string>) => Response | Promise<Response>,
) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    return handler(url, headers);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};
const client = (fetchImpl: typeof fetch, extra = {}) =>
  new GitHubClient(source, { token: TOKEN, fetchImpl, ...extra });

const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigSourceError);
    expect((err as Error).message).not.toContain(TOKEN);
    return (err as ConfigSourceError).kind;
  }
  throw new Error('expected a failure');
};

describe('GitHubClient.resolveRef', () => {
  it('asks the commits endpoint with the token and returns the full commit ID', async () => {
    const { calls, fetchImpl } = stub(() => new Response(`${SHA}\n`));
    expect(await client(fetchImpl).resolveRef('feature/x y')).toBe(SHA);
    expect(calls[0].url).toBe('http://api.test/repos/o/r/commits/feature/x%20y');
    expect(calls[0].headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.sha',
      }),
    );
  });

  it('sends no Authorization header without a token', async () => {
    const { calls, fetchImpl } = stub(() => new Response(SHA));
    await new GitHubClient(source, { fetchImpl }).resolveRef('main');
    expect(calls[0].headers).not.toHaveProperty('Authorization');
  });

  it.each([
    [404, 'not_found'],
    [422, 'not_found'],
    [401, 'denied'],
    [403, 'denied'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [429, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { fetchImpl } = stub(() => new Response('{"message":"x"}', { status }));
    expect(await kindOf(client(fetchImpl).resolveRef('main'))).toBe(kind);
  });

  it('treats a rate-limit 403 as unavailable', async () => {
    const { fetchImpl } = stub(
      () =>
        new Response('API rate limit exceeded', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        }),
    );
    expect(await kindOf(client(fetchImpl).resolveRef('main'))).toBe('unavailable');
  });

  it('maps network errors to unavailable and redacts the token', async () => {
    const { fetchImpl } = stub(() => {
      throw new Error(`connect failed with Authorization: Bearer ${TOKEN} and ${TOKEN}`);
    });
    expect(await kindOf(client(fetchImpl).resolveRef('main'))).toBe('unavailable');
  });

  it('rejects a malformed answer', async () => {
    const { fetchImpl } = stub(() => new Response('not a sha'));
    expect(await kindOf(client(fetchImpl).resolveRef('main'))).toBe('unavailable');
  });
});

describe('GitHubClient.fetchFiles', () => {
  const FILES = {
    'langchain-example/config.yml': 'env: {}\n',
    'langchain-example/agents/selector.yml': 'sel\n',
    'langchain-example/agents/other.yml': 'oth\n',
    'langchain-example/agents/notes.txt': 'ignored',
    'langchain-example/agents/deep/x.yml': 'ignored',
    'other-dir/config.yml': 'ignored',
    'README.md': 'ignored',
  };

  const redirecting = async (files: Record<string, string> = FILES) => {
    const body = await tarball(files);
    return stub((url) =>
      url.startsWith('http://api.test/')
        ? new Response(null, {
            status: 302,
            headers: {
              location: `https://codeload.github.com/o/r/legacy.tar.gz/refs/heads/x?token=PRESIGNED`,
            },
          })
        : new Response(new Uint8Array(body)),
    );
  };

  it('unpacks config.yml and agents/*.yml of the sub-path in memory', async () => {
    const { fetchImpl } = await redirecting();
    expect(await client(fetchImpl).fetchFiles(SHA)).toEqual({
      configYml: 'env: {}\n',
      agents: { other: 'oth\n', selector: 'sel\n' },
    });
  });

  it('sends the token to the API host only, not to the download host', async () => {
    const { calls, fetchImpl } = await redirecting();
    await client(fetchImpl).fetchFiles(SHA);
    expect(calls[0].url).toBe(`http://api.test/repos/o/r/tarball/${SHA}`);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[1].url).toContain('https://codeload.github.com/');
    expect(calls[1].headers).not.toHaveProperty('Authorization');
  });

  it('refuses a redirect to an unrelated host', async () => {
    const { calls, fetchImpl } = stub(
      () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x' } }),
    );
    expect(await kindOf(client(fetchImpl).fetchFiles(SHA))).toBe('unavailable');
    expect(calls).toHaveLength(1);
  });

  it('fails when config.yml is missing under the sub-path', async () => {
    const { fetchImpl } = await redirecting({ 'other-dir/config.yml': 'x' });
    expect(await kindOf(client(fetchImpl).fetchFiles(SHA))).toBe('not_found');
  });

  it('reads the repository root when there is no sub-path', async () => {
    const { fetchImpl } = await redirecting({ 'config.yml': 'root\n', 'agents/a.yml': 'a\n' });
    const root = parseSource('https://github.com/o/r', 'http://api.test') as GitHubSource;
    expect(await new GitHubClient(root, { fetchImpl }).fetchFiles(SHA)).toEqual({
      configYml: 'root\n',
      agents: { a: 'a\n' },
    });
  });

  it('refuses an archive over the size cap', async () => {
    const { fetchImpl } = await redirecting();
    expect(await kindOf(client(fetchImpl, { maxBytes: 50 }).fetchFiles(SHA))).toBe('unavailable');
  });

  it('maps a 404 on the tarball to not_found', async () => {
    const { fetchImpl } = stub(() => new Response('', { status: 404 }));
    expect(await kindOf(client(fetchImpl).fetchFiles(SHA))).toBe('not_found');
  });
});
