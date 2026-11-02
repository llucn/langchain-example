import { MigrationInterface, QueryRunner } from 'typeorm';

/** Long-term per-user memories. */
export class UserMemories1700000000008 implements MigrationInterface {
  name = 'UserMemories1700000000008';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "user_memories" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "ownerSub" character varying,
      "content" text NOT NULL,
      "source" character varying(16) NOT NULL,
      "sessionId" uuid,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_user_memories" PRIMARY KEY ("id"),
      CONSTRAINT "FK_user_memories_session" FOREIGN KEY ("sessionId")
        REFERENCES "chat_sessions"("id") ON DELETE SET NULL
    )`);
    await q.query(
      'CREATE INDEX "IDX_user_memories_owner" ON "user_memories" ("ownerSub", "updatedAt")',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "user_memories"');
  }
}
