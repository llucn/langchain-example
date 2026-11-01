import type { CaseEvidence, Diagnosis } from '@app/shared';
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ImprovementProposal } from './improvement-proposal.entity';

/** A Bad review of a proposal with the evidence it was diagnosed from. */
@Entity('improvement_cases')
export class ImprovementCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  proposalId: string;

  @ManyToOne(() => ImprovementProposal, { onDelete: 'CASCADE' })
  proposal: ImprovementProposal;

  /** No foreign key: the case keeps its evidence if the review is later changed or removed. */
  @Column({ type: 'uuid' })
  reviewId: string;

  @Column({ type: 'jsonb' })
  evidence: CaseEvidence;

  @Column({ type: 'jsonb', nullable: true })
  diagnosis: Diagnosis | null;
}
