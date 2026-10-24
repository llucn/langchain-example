import { MigrationInterface, QueryRunner } from 'typeorm';

export class Chat1700000000001 implements MigrationInterface {
  name = 'Chat1700000000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "chat_sessions" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "ownerSub" character varying,
      "name" text,
      "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_chat_sessions_id" PRIMARY KEY ("id")
    )`);
    await q.query(`CREATE TABLE "chat_messages" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sessionId" uuid NOT NULL,
      "role" character varying(16) NOT NULL,
      "content" text NOT NULL,
      "thinking" text,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_chat_messages_id" PRIMARY KEY ("id"),
      CONSTRAINT "FK_chat_messages_session" FOREIGN KEY ("sessionId")
        REFERENCES "chat_sessions"("id") ON DELETE CASCADE
    )`);
    await q.query('CREATE INDEX "IDX_chat_messages_sessionId" ON "chat_messages" ("sessionId")');
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "chat_messages"');
    await q.query('DROP TABLE "chat_sessions"');
  }
}
