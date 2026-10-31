import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * A distinct agent definition, stored once. `hash` is the SHA-256 of the definition now and will
 * become a Git commit ID when the Agent Config moves to a repository (hence varchar, not char).
 */
@Entity('agent_config_snapshots')
export class AgentConfigSnapshot {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  hash: string;

  @Column({ type: 'varchar', length: 64 })
  agentName: string;

  @Column({ type: 'varchar', length: 32 })
  version: string;

  @Column({ type: 'jsonb' })
  definition: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  firstSeenAt: Date;
}
