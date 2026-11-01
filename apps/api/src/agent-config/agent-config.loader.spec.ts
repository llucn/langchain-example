import { AgentConfigError, ConfigSourceError } from './agent-config.error';
import {
  contentHash,
  fromRows,
  loadAgentConfig,
  toRows,
  type RemoteConfig,
} from './agent-config.loader';
import type { ConfigFiles } from './agent-config.types';
import type { SnapshotRow, SnapshotStore } from './snapshot.store';

const TOOLS = ['renameSession', 'selectAgent'];
const SOURCE = 'https://github.com/o/r//cfg';
const agent = (model = 'm') =>
  `model: ${model}\nmaxTokens: 10\nthinking:\n  type: adaptive\noutputConfig:\n  effort: low\ntools: []\nsystemPrompt: p\n`;
const files = (model = 'm'): ConfigFiles => ({
  configYml: 'env: {}\n',
  agents: { selector: agent(model), other: agent(model) },
});

/** In-memory SnapshotStore with the semantics of the TypeORM one. */
class MemoryStore implements SnapshotStore {
  rows: (SnapshotRow & { resolvedAt: number })[] = [];
  private clock = 0;
  failSave = false;
  async find(hash: string, source: string) {
    return this.rows.filter((r) => r.hash === hash && r.source === source);
  }
  async saveAll(rows: SnapshotRow[]) {
    if (this.failSave) throw new Error('db down'); // nothing written: atomic
    for (const r of rows) {
      this.rows = this.rows.filter((x) => !(x.hash === r.hash && x.agentName === r.agentName));
      this.rows.push({ ...r, resolvedAt: ++this.clock });
    }
  }
  async touchVersion(hash: string, source: string, version: string) {
    for (const r of this.rows)
      if (r.hash === hash && r.source === source)
        Object.assign(r, { version, resolvedAt: ++this.clock });
  }
  async latest(source: string, version: string) {
    const m = this.rows
      .filter((r) => r.source === source && r.version === version)
      .sort((a, b) => b.resolvedAt - a.resolvedAt)[0];
    return m ? this.find(m.hash, source) : [];
  }
}

class FakeRemote implements RemoteConfig {
  refs: Record<string, string> = { v1: 'c1'.padEnd(40, '0'), main: 'c1'.padEnd(40, '0') };
  trees: Record<string, ConfigFiles> = { ['c1'.padEnd(40, '0')]: files() };
  resolveError?: ConfigSourceError;
  fetchError?: ConfigSourceError;
  fetches = 0;
  async resolveRef(ref: string) {
    if (this.resolveError) throw this.resolveError;
    const hash = this.refs[ref];
    if (!hash) throw new ConfigSourceError('not_found', `no ref ${ref}`);
    return hash;
  }
  async fetchFiles(commit: string) {
    this.fetches++;
    if (this.fetchError) throw this.fetchError;
    return this.trees[commit];
  }
}

const load = (remote: FakeRemote, store: MemoryStore, ref = 'v1') =>
  loadAgentConfig({
    env: { source: SOURCE, ref },
    store,
    knownLocalTools: TOOLS,
    remote: () => remote,
  });

describe('loadAgentConfig (GitHub source)', () => {
  const C1 = 'c1'.padEnd(40, '0');

  it('downloads on the first start and stores one row per agent', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    const c = await load(remote, store);
    expect(c).toEqual(
      expect.objectContaining({ hash: C1, version: 'v1', source: 'https://github.com/o/r//cfg' }),
    );
    expect(store.rows.map((r) => [r.hash, r.agentName, r.version]).sort()).toEqual([
      [C1, 'other', 'v1'],
      [C1, 'selector', 'v1'],
    ]);
    expect(remote.fetches).toBe(1);
  });

  it('serves the same commit from the snapshots without downloading', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    const first = await load(remote, store);
    const again = await load(remote, store);
    expect(remote.fetches).toBe(1);
    expect(again).toEqual(first);
  });

  it('invalidates when a branch moves and keeps the old rows', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    await load(remote, store, 'main');
    const C2 = 'c2'.padEnd(40, '0');
    remote.refs.main = C2;
    remote.trees[C2] = files('m2');
    const c = await load(remote, store, 'main');
    expect(c.hash).toBe(C2);
    expect(c.agents.other.model).toBe('m2');
    expect(remote.fetches).toBe(2);
    expect(new Set(store.rows.map((r) => r.hash))).toEqual(new Set([C1, C2]));
  });

  it('reuses the rows when only the ref changes and updates their version', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    await load(remote, store, 'v1');
    remote.refs[C1] = C1;
    const c = await load(remote, store, C1);
    expect(remote.fetches).toBe(1);
    expect(c.version).toBe(C1);
    expect(store.rows.every((r) => r.version === C1)).toBe(true);
  });

  it('leaves no rows when storing fails midway', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    store.failSave = true;
    await expect(load(remote, store)).rejects.toThrow('db down');
    expect(store.rows).toEqual([]);
    store.failSave = false;
    await load(remote, store);
    expect(remote.fetches).toBe(2);
  });

  describe('when GitHub is unavailable', () => {
    const warm = async () => {
      const remote = new FakeRemote();
      const store = new MemoryStore();
      await load(remote, store, 'main');
      return { remote, store };
    };

    it.each(['unavailable', 'denied'] as const)(
      'falls back to the newest snapshot on %s',
      async (kind) => {
        const { remote, store } = await warm();
        remote.resolveError = new ConfigSourceError(kind, 'GitHub down');
        const c = await load(remote, store, 'main');
        expect(c.hash).toBe(C1);
        expect(c.version).toBe('main');
      },
    );

    it('falls back when the download fails after the ref resolved', async () => {
      const { remote, store } = await warm();
      const C2 = 'c2'.padEnd(40, '0');
      remote.refs.main = C2;
      remote.fetchError = new ConfigSourceError('unavailable', 'tarball failed');
      expect((await load(remote, store, 'main')).hash).toBe(C1);
    });

    it('fails without a snapshot', async () => {
      const remote = new FakeRemote();
      remote.resolveError = new ConfigSourceError('unavailable', 'GitHub down');
      await expect(load(remote, new MemoryStore())).rejects.toThrow('GitHub down');
    });

    it('does not fall back for a ref that is not found', async () => {
      const { remote, store } = await warm();
      await expect(load(remote, store, 'gone')).rejects.toThrow('no ref gone');
    });
  });

  it('fails on an invalid commit even if an older snapshot exists', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    await load(remote, store, 'main');
    const C2 = 'c2'.padEnd(40, '0');
    remote.refs.main = C2;
    remote.trees[C2] = {
      configYml: 'env: {}\n',
      agents: { selector: 'model: 1\n', other: agent() },
    };
    await expect(load(remote, store, 'main')).rejects.toBeInstanceOf(AgentConfigError);
    expect(store.rows.some((r) => r.hash === C2)).toBe(false);
  });

  it('names the missing variables', async () => {
    const env = { source: SOURCE, ref: 'v1' };
    await expect(loadAgentConfig({ env: { ref: 'v1' }, knownLocalTools: TOOLS })).rejects.toThrow(
      'CONFIG_SOURCE',
    );
    await expect(
      loadAgentConfig({
        env: { source: env.source },
        store: new MemoryStore(),
        knownLocalTools: TOOLS,
      }),
    ).rejects.toThrow('CONFIG_REF');
  });
});

describe('snapshot rows', () => {
  it('round-trips a config through rows', async () => {
    const remote = new FakeRemote();
    const store = new MemoryStore();
    const c = await load(remote, store);
    expect(fromRows(toRows(c) as SnapshotRow[], 'v1')).toEqual(c);
    expect(toRows(c)[0].contentHash).toBe(contentHash(c.agents[toRows(c)[0].agentName]));
  });

  it('hashes the content independent of key order', () => {
    expect(contentHash({ a: 1, b: { c: 2, d: 3 } })).toBe(contentHash({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe('loadAgentConfig (local directory)', () => {
  it('reads the sample without a store and labels the version', async () => {
    const { SAMPLE_CONFIG_DIR } = await import('./sample-config');
    const c = await loadAgentConfig({ env: { source: SAMPLE_CONFIG_DIR }, knownLocalTools: TOOLS });
    expect(c.version).toBe('local');
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    const withRef = await loadAgentConfig({
      env: { source: SAMPLE_CONFIG_DIR, ref: 'dev' },
      knownLocalTools: TOOLS,
    });
    expect(withRef.version).toBe('dev');
  });
});
