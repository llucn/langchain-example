import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin-stored overrides of runtime settings. */
export class AppSettings1700000000007 implements MigrationInterface {
  name = 'AppSettings1700000000007';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "app_settings" (
      "key" character varying(64) NOT NULL,
      "value" text NOT NULL,
      "secret" boolean NOT NULL DEFAULT false,
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedBy" character varying(255),
      CONSTRAINT "PK_app_settings" PRIMARY KEY ("key")
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "app_settings"');
  }
}
