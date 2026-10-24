import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS "vector"');
    await q.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await q.query(`CREATE TABLE "users" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sub" character varying NOT NULL,
      "email" character varying,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_users_sub" UNIQUE ("sub"),
      CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
    )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "users"');
  }
}
