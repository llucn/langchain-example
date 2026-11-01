import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * One agent of one Agent Config commit, rendered and validated. All rows of a commit are written
 * in one transaction, so their presence means the commit's config is complete. `hash` is the Git
 * commit ID (the content hash of a local directory, or - in rows written before the config moved
 * to a repository - the SHA-256 of the definition); `version` is the `CONFIG_REF` it was last
 * resolved from.
 */
@Entity('agent_config_snapshots')
export class AgentConfigSnapshot {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  hash: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  agentName: string;

  @Column({ type: 'varchar', length: 255 })
  version: string;

  /** Repository URL + sub-path without credentials; '' for rows written before versioning. */
  @Column({ type: 'varchar', length: 512, default: '' })
  source: string;

  @Column({ type: 'jsonb' })
  definition: Record<string, unknown>;

  /** `{ settings, mcpServers, model }` of the commit; identical on every row of a commit. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, unknown>;

  /** SHA-256 of the canonical definition (stable across commits that did not change it). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  firstSeenAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  resolvedAt: Date;
}
