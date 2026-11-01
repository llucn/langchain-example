import type { ImprovementFile, ImprovementStatus } from '@app/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A proposed change of the Agent Config for one agent, generated from Bad reviews. `files` holds
 * the base and proposed text of every changed file; the diff is derived from them by the system.
 */
@Entity('improvement_proposals')
export class ImprovementProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  agentName: string;

  @Column({ type: 'varchar', length: 16 })
  status: ImprovementStatus;

  /** Config commit (or content hash of a local directory) the proposal was computed against. */
  @Column({ type: 'varchar', length: 64 })
  baseCommit: string;

  @Column({ type: 'varchar', length: 512 })
  baseSource: string;

  @Column({ type: 'varchar', nullable: true })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true })
  createdByName: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  files: ImprovementFile[];

  @Column({ type: 'text', default: '' })
  diff: string;

  @Column({ type: 'text', default: '' })
  rationale: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  notes: string[];

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'boolean', default: false })
  inventoryAvailable: boolean;

  /** A target file changed on the default branch since the proposal was computed. */
  @Column({ type: 'boolean', default: false })
  stale: boolean;

  /** Set when publishing starts (it is the claim that keeps a second request out) and kept after. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  branch: string | null;

  @Column({ type: 'text', nullable: true })
  prUrl: string | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
