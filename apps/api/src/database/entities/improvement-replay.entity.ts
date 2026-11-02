import type { ReplayKind, ReplayOutput, ReplayVerdict } from '@app/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImprovementProposal } from './improvement-proposal.entity';

/** A replayed review of a proposal: old and new output, each run once, and the judge's verdict. */
@Entity('improvement_replays')
export class ImprovementReplay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  proposalId: string;

  @ManyToOne(() => ImprovementProposal, { onDelete: 'CASCADE' })
  proposal: ImprovementProposal;

  /** No foreign key, like the cases: the replay keeps its result if the review changes. */
  @Column({ type: 'uuid' })
  reviewId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: ReplayKind;

  @Column({ type: 'jsonb', nullable: true })
  old: ReplayOutput | null;

  @Column({ type: 'jsonb', nullable: true })
  new: ReplayOutput | null;

  @Column({ type: 'jsonb', nullable: true })
  verdict: ReplayVerdict | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
