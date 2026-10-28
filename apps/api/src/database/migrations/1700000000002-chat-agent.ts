import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatAgent1700000000002 implements MigrationInterface {
  name = 'ChatAgent1700000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "chat_sessions" ADD "agent" character varying(64) NOT NULL DEFAULT 'selector'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "chat_sessions" DROP COLUMN "agent"');
  }
}
