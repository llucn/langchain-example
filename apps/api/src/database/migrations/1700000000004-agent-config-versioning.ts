import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `agent_config_snapshots` becomes one row per agent per commit: primary key (hash, agentName),
 * plus the config source, the commit's global settings, the definition's content hash and the
 * time of the last resolution. The foreign key from chat_log_messages (to `hash` alone) cannot
 * survive that; messages keep `agentName` + `agentConfigHash`, which identify the row.
 */
export class AgentConfigVersioning1700000000004 implements MigrationInterface {
  name = 'AgentConfigVersioning1700000000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "chat_log_messages" DROP CONSTRAINT "FK_chat_log_messages_config"');
    await q.query(
      'ALTER TABLE "agent_config_snapshots" DROP CONSTRAINT "PK_agent_config_snapshots"',
    );
    await q.query(
      'ALTER TABLE "agent_config_snapshots" ADD CONSTRAINT "PK_agent_config_snapshots" PRIMARY KEY ("hash", "agentName")',
    );
    await q.query(
      'ALTER TABLE "agent_config_snapshots" ALTER COLUMN "version" TYPE character varying(255)',
    );
    await q.query(`ALTER TABLE "agent_config_snapshots"
      ADD COLUMN "source" character varying(512) NOT NULL DEFAULT '',
      ADD COLUMN "settings" jsonb NOT NULL DEFAULT '{}',
      ADD COLUMN "contentHash" character varying(64),
      ADD COLUMN "resolvedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
    await q.query(
      'CREATE INDEX "IDX_agent_config_snapshots_source_version" ON "agent_config_snapshots" ("source", "version", "resolvedAt")',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX "IDX_agent_config_snapshots_source_version"');
    // Several agents share a commit ID now: keep one row per hash so the old key and FK fit again.
    await q.query(`DELETE FROM "agent_config_snapshots" a USING "agent_config_snapshots" b
      WHERE a."hash" = b."hash" AND a."agentName" > b."agentName"`);
    await q.query(`ALTER TABLE "agent_config_snapshots"
      DROP COLUMN "source", DROP COLUMN "settings", DROP COLUMN "contentHash", DROP COLUMN "resolvedAt"`);
    await q.query(
      'ALTER TABLE "agent_config_snapshots" ALTER COLUMN "version" TYPE character varying(32) USING left("version", 32)',
    );
    await q.query(
      'ALTER TABLE "agent_config_snapshots" DROP CONSTRAINT "PK_agent_config_snapshots"',
    );
    await q.query(
      'ALTER TABLE "agent_config_snapshots" ADD CONSTRAINT "PK_agent_config_snapshots" PRIMARY KEY ("hash")',
    );
    await q.query(`UPDATE "chat_log_messages" SET "agentConfigHash" = NULL
      WHERE "agentConfigHash" IS NOT NULL
        AND "agentConfigHash" NOT IN (SELECT "hash" FROM "agent_config_snapshots")`);
    await q.query(`ALTER TABLE "chat_log_messages" ADD CONSTRAINT "FK_chat_log_messages_config"
      FOREIGN KEY ("agentConfigHash") REFERENCES "agent_config_snapshots"("hash")`);
  }
}
