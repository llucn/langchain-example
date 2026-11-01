import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AgentConfigError } from './agent-config.error';
import type { ConfigFiles } from './agent-config.types';

export interface GitHubSource {
  kind: 'github';
  host: string;
  owner: string;
  repo: string;
  /** Directory inside the repository, no leading/trailing slash; '' = repository root. */
  subPath: string;
  apiBase: string;
  /** `https://host/owner/repo[//subPath]`: key of the snapshots, free of credentials. */
  display: string;
}

export interface LocalSource {
  kind: 'local';
  dir: string;
  display: string;
}

export type ParsedSource = GitHubSource | LocalSource;

/**
 * `CONFIG_SOURCE`: `https://<host>/<owner>/<repo>[.git][//<sub-path>]` or a local directory.
 * The GitHub API base is `https://api.github.com` for github.com, `https://<host>/api/v3`
 * otherwise, unless `apiUrl` (`CONFIG_GITHUB_API_URL`) is given.
 */
export function parseSource(raw: string, apiUrl?: string): ParsedSource {
  const value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const dir = resolve(value);
    return { kind: 'local', dir, display: dir };
  }

  const afterScheme = value.indexOf('://') + 3;
  const sep = value.indexOf('//', afterScheme);
  const repoUrl = sep === -1 ? value : value.slice(0, sep);
  const subPath = (sep === -1 ? '' : value.slice(sep + 2)).replace(/^\/+|\/+$/g, '');

  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    throw new AgentConfigError(['CONFIG_SOURCE is not a valid URL']);
  }
  if (url.protocol !== 'https:') throw new AgentConfigError(['CONFIG_SOURCE must be an https URL']);
  if (url.username || url.password) {
    throw new AgentConfigError([
      'CONFIG_SOURCE must not contain credentials (use CONFIG_GITHUB_TOKEN)',
    ]);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new AgentConfigError([
      'CONFIG_SOURCE must be https://<host>/<owner>/<repo>[//<sub-path>]',
    ]);
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  const apiBase = (
    apiUrl?.trim() ||
    (url.host === 'github.com' ? 'https://api.github.com' : `https://${url.host}/api/v3`)
  ).replace(/\/+$/, '');
  return {
    kind: 'github',
    host: url.host,
    owner,
    repo,
    subPath,
    apiBase,
    display: `https://${url.host}/${owner}/${repo}${subPath ? `//${subPath}` : ''}`,
  };
}

/** Reads `config.yml` and `agents/*.yml` of a local directory; the hash covers all of them. */
export function readLocalConfig(dir: string): { files: ConfigFiles; hash: string } {
  const read = (path: string) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  };
  const configYml = read(join(dir, 'config.yml'));
  if (configYml === undefined) throw new AgentConfigError([`config.yml not found in ${dir}`]);

  const agents: Record<string, string> = {};
  let names: string[] = [];
  try {
    names = readdirSync(join(dir, 'agents')).filter(
      (n) => n.endsWith('.yml') && statSync(join(dir, 'agents', n)).isFile(),
    );
  } catch {
    // no agents directory: reported as missing required agents by validation
  }
  for (const n of names.sort())
    agents[n.slice(0, -4)] = readFileSync(join(dir, 'agents', n), 'utf8');

  const hash = createHash('sha256');
  hash.update(`config.yml\0${configYml}\0`);
  for (const [name, text] of Object.entries(agents)) hash.update(`agents/${name}.yml\0${text}\0`);
  return { files: { configYml, agents }, hash: hash.digest('hex') };
}
