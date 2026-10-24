import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { loadEnv } from '../../config/env';

/** Connects to the maintenance database `postgres` (for CREATE/DROP DATABASE). */
export function adminClient(database = 'postgres') {
  const { db } = loadEnv();
  return new Client({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database,
    ssl: db.ssl
      ? {
          rejectUnauthorized: db.sslRejectUnauthorized,
          ca: db.sslCaPath ? readFileSync(db.sslCaPath, 'utf8') : undefined,
        }
      : false,
  });
}

export const quoteIdent = (s: string) => `"${s.replace(/"/g, '""')}"`;
