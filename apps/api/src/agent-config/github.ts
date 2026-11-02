import { Parser } from 'tar';
import { ConfigSourceError } from './agent-config.error';
import type { ConfigFiles } from './agent-config.types';
import { redactor } from './redact';
import type { GitHubSource } from './source';

const COMMIT = /^[0-9a-f]{40}$/;
const MAX_REDIRECTS = 3;
const MAX_FILE_BYTES = 1024 * 1024;

export interface GitHubClientOptions {
  token?: string;
  timeoutMs?: number;
  /** Cap of the compressed tarball. */
  maxBytes?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Reads a config tree from a GitHub repository through the REST API: the ref is resolved to a
 * commit, then the commit's tarball is unpacked in memory (nothing touches the disk). The token is
 * sent to the API host only; redirects (to the download host) go without it and only to GitHub's
 * own hosts.
 */
export class GitHubClient {
  private readonly redact: (t: string) => string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(
    private readonly src: GitHubSource,
    private readonly opts: GitHubClientOptions = {},
  ) {
    this.redact = redactor(opts.token);
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxBytes = opts.maxBytes ?? 20 * 1024 * 1024;
  }

  private get apiHost() {
    return new URL(this.src.apiBase).host;
  }

  private get allowedHosts() {
    return new Set([this.src.host, this.apiHost, `codeload.${this.src.host}`]);
  }

  private repoPath() {
    return `${this.src.apiBase}/repos/${encodeURIComponent(this.src.owner)}/${encodeURIComponent(this.src.repo)}`;
  }

  private async request(url: string, accept: string, withToken: boolean): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'langchain-example-agent-config',
    };
    if (withToken && this.opts.token) headers.Authorization = `Bearer ${this.opts.token}`;
    try {
      return await this.fetchImpl(url, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ConfigSourceError(
        'unavailable',
        this.redact(`GitHub is not reachable: ${(err as Error).message}`),
      );
    }
  }

  private async fail(res: Response, what: string): Promise<never> {
    const body = this.redact((await res.text().catch(() => '')).slice(0, 300));
    const where = `${this.src.display} (${what})`;
    const rateLimited =
      res.status === 429 ||
      (res.status === 403 &&
        (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(body)));
    if (rateLimited || res.status >= 500) {
      throw new ConfigSourceError(
        'unavailable',
        `GitHub unavailable or rate limited for ${where}: HTTP ${res.status}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new ConfigSourceError(
        'denied',
        `GitHub denied access to ${where}: HTTP ${res.status}; check CONFIG_GITHUB_TOKEN`,
      );
    }
    if (res.status === 404 || res.status === 422) {
      throw new ConfigSourceError(
        'not_found',
        `Repository or reference not found, or not accessible with the token: ${where}`,
      );
    }
    throw new ConfigSourceError(
      'unavailable',
      `Unexpected HTTP ${res.status} from GitHub for ${where}`,
    );
  }

  /** Branch, tag or (abbreviated) commit ID -> full commit ID. */
  async resolveRef(ref: string): Promise<string> {
    const path = ref.split('/').map(encodeURIComponent).join('/');
    const res = await this.request(
      `${this.repoPath()}/commits/${path}`,
      'application/vnd.github.sha',
      true,
    );
    if (!res.ok) return this.fail(res, `ref ${ref}`);
    const sha = (await res.text()).trim().toLowerCase();
    if (!COMMIT.test(sha)) {
      throw new ConfigSourceError('unavailable', `GitHub returned an unexpected commit for ${ref}`);
    }
    return sha;
  }

  /** Branches and tags of the repository (up to 300 each) and its default branch. */
  async listRefs(): Promise<{ branches: string[]; tags: string[]; defaultBranch: string }> {
    const get = async (url: string, what: string) => {
      const res = await this.request(url, 'application/vnd.github+json', true);
      if (!res.ok) return this.fail(res, what);
      return (await res.json()) as Record<string, unknown>[] | Record<string, unknown>;
    };
    const names = async (kind: 'branches' | 'tags') => {
      const out: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const list = (await get(`${this.repoPath()}/${kind}?per_page=100&page=${page}`, kind)) as {
          name: string;
        }[];
        out.push(...list.map((r) => r.name));
        if (list.length < 100) break;
      }
      return out;
    };
    const repo = (await get(this.repoPath(), 'repository')) as { default_branch?: string };
    return {
      branches: await names('branches'),
      tags: await names('tags'),
      defaultBranch: repo.default_branch ?? '',
    };
  }

  /** `config.yml` and `agents/*.yml` under the source's sub-path at the given commit. */
  async fetchFiles(commit: string): Promise<ConfigFiles> {
    let url = `${this.repoPath()}/tarball/${commit}`;
    let res: Response | undefined;
    for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
      const target = new URL(url);
      if (!this.allowedHosts.has(target.host)) {
        throw new ConfigSourceError(
          'unavailable',
          `Refusing to download from unexpected host ${target.host}`,
        );
      }
      res = await this.request(url, 'application/vnd.github+json', target.host === this.apiHost);
      const next = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && next) {
        await res.body?.cancel().catch(() => undefined);
        url = new URL(next, url).toString();
        continue;
      }
      break;
    }
    if (!res || res.status >= 300) {
      if (res && res.status < 400) {
        throw new ConfigSourceError('unavailable', 'Too many redirects downloading the config');
      }
      return this.fail(res as Response, `tarball ${commit}`);
    }
    return this.unpack(res, commit);
  }

  private async unpack(res: Response, commit: string): Promise<ConfigFiles> {
    const prefix = this.src.subPath ? `${this.src.subPath}/` : '';
    const found = new Map<string, string>();
    const failure: { error?: Error } = {};

    const parser = new Parser({
      onReadEntry: (entry) => {
        // First path segment is the `<owner>-<repo>-<sha>` root directory.
        const rel = entry.path.split('/').slice(1).join('/');
        const wanted =
          entry.type === 'File' &&
          rel.startsWith(prefix) &&
          (rel.slice(prefix.length) === 'config.yml' ||
            /^agents\/[^/]+\.yml$/.test(rel.slice(prefix.length)));
        if (!wanted) return void entry.resume();
        const chunks: Buffer[] = [];
        let size = 0;
        entry.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_FILE_BYTES) failure.error ??= new Error(`${rel} is larger than 1 MB`);
          else chunks.push(c);
        });
        entry.on('end', () =>
          found.set(rel.slice(prefix.length), Buffer.concat(chunks).toString('utf8')),
        );
      },
    });
    const done = new Promise<void>((resolveDone, reject) => {
      parser.on('end', () => resolveDone());
      parser.on('error', reject);
    });

    let total = 0;
    try {
      if (!res.body) throw new Error('empty response');
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > this.maxBytes) throw new Error(`archive is larger than ${this.maxBytes} bytes`);
        parser.write(Buffer.from(chunk));
      }
      parser.end();
      await done;
    } catch (err) {
      throw new ConfigSourceError(
        'unavailable',
        this.redact(`Reading the config archive failed: ${(err as Error).message}`),
      );
    }
    if (failure.error) throw new ConfigSourceError('unavailable', failure.error.message);

    const configYml = found.get('config.yml');
    if (configYml === undefined) {
      throw new ConfigSourceError(
        'not_found',
        `config.yml not found in ${this.src.display} at commit ${commit.slice(0, 7)}`,
      );
    }
    const agents: Record<string, string> = {};
    for (const [rel, text] of [...found].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (rel.startsWith('agents/')) agents[rel.slice('agents/'.length, -'.yml'.length)] = text;
    }
    return { configYml, agents };
  }
}
