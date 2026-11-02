import { GitHubWriteError, GitHubWriter } from './github-writer';
import { parseSource, type GitHubSource } from './source';

const TOKEN = 'ghp_secret_token_123';
const source = parseSource(
  'https://github.com/o/r//langchain-example',
  'http://api.test',
) as GitHubSource;

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: { base?: string; parents?: string[]; [k: string]: unknown };
}

const stub = (routes: Record<string, (c: Call) => Response>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = {
      method: init.method ?? 'GET',
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const key = Object.keys(routes).find((k) =>
      `${call.method} ${url.replace('http://api.test/repos/o/r', '')}`.startsWith(k),
    );
    if (!key) return new Response('{}', { status: 500 });
    return routes[key](call);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });

describe('GitHubWriter', () => {
  it('opens a pull request from a new branch with one commit and never touches the default branch', async () => {
    const { calls, fetchImpl } = stub({
      'GET /git/ref/heads/main': () => json({ object: { sha: 'headsha' } }),
      'GET /git/commits/headsha': () => json({ tree: { sha: 'treesha' } }),
      'POST /git/refs': () => json({}, 201),
      'POST /git/blobs': () => json({ sha: 'blobsha' }, 201),
      'POST /git/trees': () => json({ sha: 'newtree' }, 201),
      'POST /git/commits': () => json({ sha: 'newcommit' }, 201),
      'PATCH /git/refs/heads/improvement/ab12': () => json({}),
      'POST /pulls': () => json({ html_url: 'https://github.com/o/r/pull/9' }, 201),
    });
    const w = new GitHubWriter(source, { token: TOKEN, fetchImpl });
    const head = await w.head('main');
    await w.createBranch('improvement/ab12', head.commit);
    await w.commitFiles('improvement/ab12', head, [{ path: 'agents/x.yml', text: 'new' }], 'msg');
    const url = await w.openPullRequest({
      title: 't',
      head: 'improvement/ab12',
      base: 'main',
      body: 'b',
    });

    expect(url).toBe('https://github.com/o/r/pull/9');
    expect(calls.every((c) => c.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls.find((c) => c.url.endsWith('/git/trees'))?.body).toEqual({
      base_tree: 'treesha',
      tree: [
        { path: 'langchain-example/agents/x.yml', mode: '100644', type: 'blob', sha: 'blobsha' },
      ],
    });
    expect(calls.find((c) => c.url.endsWith('/git/commits'))?.body?.parents).toEqual(['headsha']);
    // The only ref that is moved is the new branch.
    expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.url)).toEqual([
      'http://api.test/repos/o/r/git/refs/heads/improvement/ab12',
    ]);
    expect(calls.find((c) => c.url.endsWith('/pulls'))?.body?.base).toBe('main');
  });

  it('reads a file at a commit, null when missing', async () => {
    const { fetchImpl } = stub({
      'GET /contents/langchain-example/agents/a.yml': () => new Response('text'),
      'GET /contents/langchain-example/agents/b.yml': () => new Response('', { status: 404 }),
    });
    const w = new GitHubWriter(source, { token: TOKEN, fetchImpl });
    expect(await w.fileText('agents/a.yml', 'sha')).toBe('text');
    expect(await w.fileText('agents/b.yml', 'sha')).toBeNull();
  });

  it('reports missing write permission without leaking the token', async () => {
    const { fetchImpl } = stub({
      'POST /git/refs': () => new Response(`denied for ${TOKEN}`, { status: 403 }),
    });
    const w = new GitHubWriter(source, { token: TOKEN, fetchImpl });
    const err = await w.createBranch('improvement/x', 'sha').catch((e) => e as GitHubWriteError);
    expect(err).toBeInstanceOf(GitHubWriteError);
    expect((err as GitHubWriteError).kind).toBe('permission');
    expect((err as Error).message).toContain('Contents and Pull requests write access');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('maps an existing branch to a conflict', async () => {
    const { fetchImpl } = stub({ 'POST /git/refs': () => new Response('exists', { status: 422 }) });
    const w = new GitHubWriter(source, { token: TOKEN, fetchImpl });
    const err = await w.createBranch('b', 'sha').catch((e) => e as GitHubWriteError);
    expect((err as GitHubWriteError).kind).toBe('conflict');
  });

  it('makes no request without a token', async () => {
    const { calls, fetchImpl } = stub({});
    const w = new GitHubWriter(source, { fetchImpl });
    await expect(w.defaultBranch()).rejects.toThrow('CONFIG_GITHUB_TOKEN');
    expect(calls).toHaveLength(0);
  });
});
