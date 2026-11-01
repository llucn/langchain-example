import { redactor } from './redact';
import type { GitHubSource } from './source';

export type GitHubWriteErrorKind =
  /** 401/403/404 on a write: the token cannot write to the repository. */
  | 'permission'
  /** 409/422: the branch exists or the ref moved. */
  | 'conflict'
  | 'unavailable';

export class GitHubWriteError extends Error {
  constructor(
    readonly kind: GitHubWriteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubWriteError';
  }
}

export interface GitHubWriterOptions {
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface BranchHead {
  commit: string;
  tree: string;
}

/**
 * Creates a branch, one commit and a pull request in the config repository through the GitHub
 * REST API (Git Data API for the commit). It never writes the default branch and never merges.
 * The token goes to the API host only, as a bearer header, and is redacted from every error.
 */
export class GitHubWriter {
  private readonly redact: (t: string) => string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly src: GitHubSource,
    private readonly opts: GitHubWriterOptions = {},
  ) {
    this.redact = redactor(opts.token);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private repo(path = '') {
    const { apiBase, owner, repo } = this.src;
    return `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
  }

  private async call<T = unknown>(
    method: string,
    url: string,
    opts: { body?: unknown; accept?: string; raw?: boolean; allow404?: boolean } = {},
  ): Promise<T> {
    if (!this.opts.token)
      throw new GitHubWriteError('permission', 'CONFIG_GITHUB_TOKEN is not set');
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Accept: opts.accept ?? 'application/vnd.github+json',
          Authorization: `Bearer ${this.opts.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'langchain-example-improvements',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new GitHubWriteError(
        'unavailable',
        this.redact(`GitHub is not reachable: ${(err as Error).message}`),
      );
    }
    if (res.ok) {
      if (res.status === 204) return null as T;
      return (opts.raw ? res.text() : res.json()) as Promise<T>;
    }
    if (res.status === 404 && opts.allow404) return null as T;
    const detail = this.redact((await res.text().catch(() => '')).slice(0, 300));
    const where = `${this.src.display} (${method} ${url.replace(this.src.apiBase, '')})`;
    if ([401, 403, 404].includes(res.status)) {
      throw new GitHubWriteError(
        'permission',
        `GitHub refused ${where}: HTTP ${res.status}; the CONFIG_GITHUB_TOKEN needs Contents and Pull requests write access to the config repository`,
      );
    }
    if (res.status === 409 || res.status === 422) {
      throw new GitHubWriteError(
        'conflict',
        `GitHub rejected ${where}: HTTP ${res.status} ${detail}`,
      );
    }
    throw new GitHubWriteError(
      'unavailable',
      `Unexpected HTTP ${res.status} from GitHub for ${where}`,
    );
  }

  /** Path inside the repository of a file of the config directory. */
  repoPath(path: string): string {
    return this.src.subPath ? `${this.src.subPath}/${path}` : path;
  }

  async defaultBranch(): Promise<string> {
    const repo = await this.call<{ default_branch: string }>('GET', this.repo());
    return repo.default_branch;
  }

  async head(branch: string): Promise<BranchHead> {
    const ref = await this.call<{ object: { sha: string } }>(
      'GET',
      this.repo(`/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`),
    );
    const commit = await this.call<{ tree: { sha: string } }>(
      'GET',
      this.repo(`/git/commits/${ref.object.sha}`),
    );
    return { commit: ref.object.sha, tree: commit.tree.sha };
  }

  /** Text of a config file at a commit; null when it does not exist there. */
  async fileText(path: string, commit: string): Promise<string | null> {
    const encoded = this.repoPath(path).split('/').map(encodeURIComponent).join('/');
    return this.call<string | null>('GET', this.repo(`/contents/${encoded}?ref=${commit}`), {
      accept: 'application/vnd.github.raw+json',
      raw: true,
      allow404: true,
    });
  }

  async createBranch(name: string, sha: string): Promise<void> {
    await this.call('POST', this.repo('/git/refs'), { body: { ref: `refs/heads/${name}`, sha } });
  }

  /** Best effort removal of a branch this writer created (never the default branch). */
  async deleteBranch(name: string): Promise<void> {
    await this.call(
      'DELETE',
      this.repo(`/git/refs/heads/${name.split('/').map(encodeURIComponent).join('/')}`),
    );
  }

  /** One commit with the given files on top of `parent`, moving `branch` to it. */
  async commitFiles(
    branch: string,
    parent: BranchHead,
    files: { path: string; text: string }[],
    message: string,
  ): Promise<string> {
    const tree: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const f of files) {
      const blob = await this.call<{ sha: string }>('POST', this.repo('/git/blobs'), {
        body: { content: f.text, encoding: 'utf-8' },
      });
      tree.push({ path: this.repoPath(f.path), mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.call<{ sha: string }>('POST', this.repo('/git/trees'), {
      body: { base_tree: parent.tree, tree },
    });
    const commit = await this.call<{ sha: string }>('POST', this.repo('/git/commits'), {
      body: { message, tree: newTree.sha, parents: [parent.commit] },
    });
    await this.call(
      'PATCH',
      this.repo(`/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`),
      {
        body: { sha: commit.sha },
      },
    );
    return commit.sha;
  }

  /** Opens (never merges) a pull request; resolves with its URL. */
  async openPullRequest(pr: {
    title: string;
    head: string;
    base: string;
    body: string;
  }): Promise<string> {
    const res = await this.call<{ html_url: string }>('POST', this.repo('/pulls'), { body: pr });
    return res.html_url;
  }
}
