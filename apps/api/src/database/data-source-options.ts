import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { AppEnv } from '../config/env';
import { AgentConfigSnapshot } from './entities/agent-config-snapshot.entity';
import { ChatLogMessage } from './entities/chat-log-message.entity';
import { ChatLogReview } from './entities/chat-log-review.entity';
import { ChatLogSession } from './entities/chat-log-session.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSession } from './entities/chat-session.entity';
import { User } from './entities/user.entity';

export function buildDataSourceOptions(env: AppEnv): DataSourceOptions {
  const { db } = env;
  // Works for both ts-node (src/*.ts) and compiled (dist/*.js)
  const ext = __filename.endsWith('.ts') ? 'ts' : 'js';
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    database: db.name,
    username: db.user,
    password: db.password,
    ssl: db.ssl
      ? {
          rejectUnauthorized: db.sslRejectUnauthorized,
          ca: db.sslCaPath ? readFileSync(db.sslCaPath, 'utf8') : undefined,
        }
      : false,
    entities: [
      User,
      ChatSession,
      ChatMessage,
      ChatLogSession,
      ChatLogMessage,
      ChatLogReview,
      AgentConfigSnapshot,
    ],
    migrations: [join(__dirname, 'migrations', `*.${ext}`)],
    migrationsRun: db.migrationsRun,
    synchronize: false,
  };
}
