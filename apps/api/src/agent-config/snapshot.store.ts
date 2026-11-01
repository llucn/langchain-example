import type { DataSource } from 'typeorm';
import { AgentConfigSnapshot } from '../database/entities/agent-config-snapshot.entity';
import type { AgentDefinition, AgentSettings, ModelConnection } from './agent-config.types';

/** What a snapshot row keeps besides the agent: the commit's global part. */
export interface SnapshotGlobals {
  settings: AgentSettings;
  mcpServers: Record<string, string>;
  model?: ModelConnection;
}

export interface SnapshotRow {
  hash: string;
  agentName: string;
  version: string;
  source: string;
  definition: AgentDefinition;
  settings: SnapshotGlobals;
  contentHash: string;
}

export interface SnapshotStore {
  /** Rows of a commit of a source (all agents), or none. */
  find(hash: string, source: string): Promise<SnapshotRow[]>;
  /** Writes all rows of a commit atomically (updating rows that exist). */
  saveAll(rows: SnapshotRow[]): Promise<void>;
  /** The commit was resolved from another ref: remember the latest one. */
  touchVersion(hash: string, source: string, version: string): Promise<void>;
  /** Rows of the most recently resolved commit of a source and version. */
  latest(source: string, version: string): Promise<SnapshotRow[]>;
}

export class TypeOrmSnapshotStore implements SnapshotStore {
  constructor(private readonly dataSource: DataSource) {}

  private get repo() {
    return this.dataSource.getRepository(AgentConfigSnapshot);
  }

  private static toRow(e: AgentConfigSnapshot): SnapshotRow {
    return {
      hash: e.hash,
      agentName: e.agentName,
      version: e.version,
      source: e.source,
      definition: e.definition as never,
      settings: e.settings as never,
      contentHash: e.contentHash ?? '',
    };
  }

  async find(hash: string, source: string) {
    return (await this.repo.find({ where: { hash, source }, order: { agentName: 'ASC' } })).map(
      TypeOrmSnapshotStore.toRow,
    );
  }

  async saveAll(rows: SnapshotRow[]) {
    const resolvedAt = new Date();
    await this.dataSource.transaction((manager) =>
      manager.upsert(
        AgentConfigSnapshot,
        // jsonb columns do not fit TypeORM's deep-partial insert type
        rows.map((r) => ({ ...r, resolvedAt })) as never,
        ['hash', 'agentName'],
      ),
    );
  }

  async touchVersion(hash: string, source: string, version: string) {
    await this.repo.update({ hash, source }, { version, resolvedAt: new Date() });
  }

  async latest(source: string, version: string) {
    const newest = await this.repo.findOne({
      where: { source, version },
      order: { resolvedAt: 'DESC' },
    });
    return newest ? this.find(newest.hash, source) : [];
  }
}
