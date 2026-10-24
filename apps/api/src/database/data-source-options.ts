import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { AppEnv } from '../config/env';
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
    entities: [User],
    migrations: [join(__dirname, 'migrations', `*.${ext}`)],
    migrationsRun: db.migrationsRun,
    synchronize: false,
  };
}
