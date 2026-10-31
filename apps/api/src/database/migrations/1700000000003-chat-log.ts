import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChatLog1700000000003 implements MigrationInterface {
  name = 'ChatLog1700000000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "agent_config_snapshots" (
      "hash" character varying(64) NOT NULL,
      "agentName" character varying(64) NOT NULL,
      "version" character varying(32) NOT NULL,
      "definition" jsonb NOT NULL,
      "firstSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_agent_config_snapshots" PRIMARY KEY ("hash")
    )`);
    await q.query(`CREATE TABLE "chat_log_sessions" (
      "id" uuid NOT NULL,
      "userSub" character varying,
      "userName" character varying,
      "appVersion" character varying(64) NOT NULL,
      "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
      "name" text,
      "deletedAt" TIMESTAMP WITH TIME ZONE,
      "messageCount" integer NOT NULL DEFAULT 0,
      CONSTRAINT "PK_chat_log_sessions" PRIMARY KEY ("id")
    )`);
    await q.query(`CREATE TABLE "chat_log_messages" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sessionId" uuid NOT NULL,
      "seq" integer NOT NULL,
      "turnId" uuid NOT NULL,
      "type" character varying(24) NOT NULL,
      "userSub" character varying,
      "agentName" character varying(64),
      "agentConfigVersion" character varying(32),
      "agentConfigHash" character varying(64),
      "appVersion" character varying(64) NOT NULL,
      "model" character varying,
      "content" text NOT NULL DEFAULT '',
      "truncated" boolean NOT NULL DEFAULT false,
      "thinking" text,
      "toolCalls" jsonb,
      "toolName" character varying,
      "toolCallId" character varying,
      "status" character varying(8) NOT NULL DEFAULT 'ok',
      "errorMessage" text,
      "startedAt" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "durationMs" integer,
      "chatMessageId" uuid,
      "metadata" jsonb NOT NULL DEFAULT '{}',
      CONSTRAINT "PK_chat_log_messages" PRIMARY KEY ("id"),
      CONSTRAINT "FK_chat_log_messages_session" FOREIGN KEY ("sessionId")
        REFERENCES "chat_log_sessions"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_chat_log_messages_config" FOREIGN KEY ("agentConfigHash")
        REFERENCES "agent_config_snapshots"("hash")
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_chat_log_messages_session_seq" ON "chat_log_messages" ("sessionId", "seq")`,
    );
    await q.query(`CREATE INDEX "IDX_chat_log_messages_turn" ON "chat_log_messages" ("turnId")`);
    await q.query(
      `CREATE INDEX "IDX_chat_log_messages_agent_config" ON "chat_log_messages" ("agentName", "agentConfigHash")`,
    );
    await q.query(
      `CREATE INDEX "IDX_chat_log_messages_created" ON "chat_log_messages" ("createdAt")`,
    );
    await q.query(`CREATE TABLE "chat_log_reviews" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "sessionId" uuid NOT NULL,
      "messageId" uuid,
      "rating" character varying(8) NOT NULL,
      "tags" text array NOT NULL DEFAULT '{}',
      "comment" text,
      "expectedResult" text,
      "difference" text,
      "reviewerType" character varying(8) NOT NULL DEFAULT 'human',
      "reviewerSub" character varying NOT NULL,
      "reviewerName" character varying,
      "evaluator" character varying(128),
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_chat_log_reviews" PRIMARY KEY ("id"),
      CONSTRAINT "FK_chat_log_reviews_session" FOREIGN KEY ("sessionId")
        REFERENCES "chat_log_sessions"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_chat_log_reviews_message" FOREIGN KEY ("messageId")
        REFERENCES "chat_log_messages"("id") ON DELETE CASCADE
    )`);
    await q.query(
      `CREATE INDEX "IDX_chat_log_reviews_session" ON "chat_log_reviews" ("sessionId")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_chat_log_reviews_session" ON "chat_log_reviews" ("sessionId", "reviewerSub") WHERE "messageId" IS NULL AND "reviewerType" = 'human'`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_chat_log_reviews_message" ON "chat_log_reviews" ("messageId", "reviewerSub") WHERE "messageId" IS NOT NULL AND "reviewerType" = 'human'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "chat_log_reviews"');
    await q.query('DROP TABLE "chat_log_messages"');
    await q.query('DROP TABLE "chat_log_sessions"');
    await q.query('DROP TABLE "agent_config_snapshots"');
  }
}
