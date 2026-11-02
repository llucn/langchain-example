import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { AgentConfigError, ConfigSourceError } from './agent-config.error';
import type { ConfigFiles, LoadedAgentConfig } from './agent-config.types';
import { GitHubClient, type GitHubClientOptions } from './github';
import { parseSource, readLocalConfig } from './source';
import type { SnapshotRow, SnapshotStore } from './snapshot.store';
import { assembleConfig } from './validate';

const logger = new Logger('AgentConfig');

export interface AgentConfigSettingsEnv {
  source?: string;
  ref?: string;
  githubToken?: string;
  githubApiUrl?: string;
}

/** The two operations the loader needs from a remote repository (GitHubClient implements them). */
export interface RemoteConfig {
  resolveRef(ref: string): Promise<string>;
  fetchFiles(commit: string): Promise<ConfigFiles>;
}

export interface LoadOptions {
  env: AgentConfigSettingsEnv;
  /** Snapshot cache; required for a GitHub source. */
  store?: SnapshotStore;
  knownLocalTools: readonly string[];
  /** Test hook: replaces the GitHub client. */
  remote?: (source: ReturnType<typeof parseSource> & { kind: 'github' }) => RemoteConfig;
  github?: GitHubClientOptions;
  /**
   * Serve the newest snapshot of the ref when GitHub is unavailable (default true). Off when a new
   * value must be verified against the source itself.
   */
  fallback?: boolean;
}

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;

export const contentHash = (definition: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonical(definition)))
    .digest('hex');

export const toRows = (config: LoadedAgentConfig): SnapshotRow[] =>
  Object.entries(config.agents).map(([agentName, definition]) => ({
    hash: config.hash,
    agentName,
    version: config.version,
    source: config.source,
    definition,
    settings: {
      settings: config.settings,
      mcpServers: config.mcpServers,
      ...(config.model ? { model: config.model } : {}),
    },
    contentHash: contentHash(definition),
  }));

export const fromRows = (rows: SnapshotRow[], version: string): LoadedAgentConfig => {
  const [first] = rows;
  return {
    hash: first.hash,
    version,
    source: first.source,
    agents: Object.fromEntries(rows.map((r) => [r.agentName, r.definition])),
    settings: first.settings.settings,
    mcpServers: first.settings.mcpServers,
    ...(first.settings.model ? { model: first.settings.model } : {}),
  };
};

/**
 * Loads the Agent Config (see the `agent-config` spec): a local directory is read as is; a GitHub
 * source is resolved to a commit, served from `agent_config_snapshots` when that commit is known,
 * otherwise downloaded, validated and stored. When GitHub is unavailable the newest snapshot of
 * the same source and ref stands in; an invalid or missing config fails.
 */
export async function loadAgentConfig(opts: LoadOptions): Promise<LoadedAgentConfig> {
  const { env } = opts;
  if (!env.source?.trim()) throw new AgentConfigError(['CONFIG_SOURCE is not set']);
  const source = parseSource(env.source, env.githubApiUrl);

  if (source.kind === 'local') {
    const { files, hash } = readLocalConfig(source.dir);
    const version = env.ref?.trim() || 'local';
    const config = assembleConfig(
      files,
      { hash, version, source: source.display },
      opts.knownLocalTools,
    );
    logger.log(`Agent config from ${source.display} (${version}, content ${hash.slice(0, 12)})`);
    return config;
  }

  const ref = env.ref?.trim();
  if (!ref) throw new AgentConfigError(['CONFIG_REF is not set']);
  if (!opts.store) throw new Error('a snapshot store is required for a GitHub source');
  const store = opts.store;
  const remote = opts.remote
    ? opts.remote(source)
    : new GitHubClient(source, { token: env.githubToken, ...opts.github });

  const fallback = async (err: ConfigSourceError): Promise<LoadedAgentConfig> => {
    if (opts.fallback === false) throw err;
    const rows = await store.latest(source.display, ref);
    if (!rows.length) throw err;
    logger.warn(
      `${err.message}; using the stored snapshot of ${ref}, commit ${rows[0].hash} (may be outdated)`,
    );
    return fromRows(rows, ref);
  };

  let hash: string;
  try {
    hash = await remote.resolveRef(ref);
  } catch (err) {
    if (err instanceof ConfigSourceError && err.kind !== 'not_found') return fallback(err);
    throw err;
  }

  const cached = await store.find(hash, source.display);
  if (cached.length) {
    if (cached[0].version !== ref) await store.touchVersion(hash, source.display, ref);
    logger.log(`Agent config ${ref} at commit ${hash} from the snapshot cache (${source.display})`);
    return fromRows(cached, ref);
  }

  let files: ConfigFiles;
  try {
    files = await remote.fetchFiles(hash);
  } catch (err) {
    if (err instanceof ConfigSourceError && err.kind !== 'not_found') return fallback(err);
    throw err;
  }
  const config = assembleConfig(
    files,
    { hash, version: ref, source: source.display },
    opts.knownLocalTools,
  );
  await store.saveAll(toRows(config));
  logger.log(`Agent config ${ref} at commit ${hash} downloaded and stored (${source.display})`);
  return config;
}
