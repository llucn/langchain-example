import { MigrationInterface, QueryRunner } from 'typeorm';

/** Replay results of proposals, and the stale flag, branch and pull request of a published one. */
export class ImprovementReplayPublish1700000000006 implements MigrationInterface {
  name = 'ImprovementReplayPublish1700000000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "improvement_proposals"
      ADD COLUMN "stale" boolean NOT NULL DEFAULT false,
      ADD COLUMN "branch" character varying(255),
      ADD COLUMN "prUrl" text`);
    await q.query(`CREATE TABLE "improvement_replays" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "proposalId" uuid NOT NULL,
      "reviewId" uuid NOT NULL,
      "kind" character varying(16) NOT NULL,
      "old" jsonb,
      "new" jsonb,
      "verdict" jsonb,
      "error" text,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_improvement_replays" PRIMARY KEY ("id"),
      CONSTRAINT "FK_improvement_replays_proposal" FOREIGN KEY ("proposalId")
        REFERENCES "improvement_proposals"("id") ON DELETE CASCADE
    )`);
    await q.query(
      `CREATE INDEX "IDX_improvement_replays_proposal" ON "improvement_replays" ("proposalId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "improvement_replays"');
    await q.query(
      'ALTER TABLE "improvement_proposals" DROP COLUMN "prUrl", DROP COLUMN "branch", DROP COLUMN "stale"',
    );
  }
}
