import { MigrationInterface, QueryRunner } from 'typeorm';

/** Improvement proposals and the cases (Bad reviews with evidence and diagnosis) they come from. */
export class ImprovementProposals1700000000005 implements MigrationInterface {
  name = 'ImprovementProposals1700000000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "improvement_proposals" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "agentName" character varying(64) NOT NULL,
      "status" character varying(16) NOT NULL,
      "baseCommit" character varying(64) NOT NULL,
      "baseSource" character varying(512) NOT NULL,
      "createdBy" character varying,
      "createdByName" character varying,
      "files" jsonb NOT NULL DEFAULT '[]',
      "diff" text NOT NULL DEFAULT '',
      "rationale" text NOT NULL DEFAULT '',
      "notes" jsonb NOT NULL DEFAULT '[]',
      "error" text,
      "inventoryAvailable" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_improvement_proposals" PRIMARY KEY ("id")
    )`);
    await q.query(
      `CREATE INDEX "IDX_improvement_proposals_agent" ON "improvement_proposals" ("agentName")`,
    );
    await q.query(
      `CREATE INDEX "IDX_improvement_proposals_created" ON "improvement_proposals" ("createdAt")`,
    );
    await q.query(`CREATE TABLE "improvement_cases" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "proposalId" uuid NOT NULL,
      "reviewId" uuid NOT NULL,
      "evidence" jsonb NOT NULL,
      "diagnosis" jsonb,
      CONSTRAINT "PK_improvement_cases" PRIMARY KEY ("id"),
      CONSTRAINT "FK_improvement_cases_proposal" FOREIGN KEY ("proposalId")
        REFERENCES "improvement_proposals"("id") ON DELETE CASCADE
    )`);
    await q.query(
      `CREATE INDEX "IDX_improvement_cases_proposal" ON "improvement_cases" ("proposalId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "improvement_cases"');
    await q.query('DROP TABLE "improvement_proposals"');
  }
}
