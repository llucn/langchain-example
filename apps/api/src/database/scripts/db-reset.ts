import Redis from 'ioredis';
import dataSource from '../data-source';
import { loadEnv } from '../../config/env';
import { adminClient, quoteIdent } from './admin-client';

/**
 * Drops and recreates the database, then runs all migrations.
 * With `--redis`, also flushes the configured Redis database (REDIS_DB only).
 */
async function main() {
  const { db, redis, nodeEnv } = loadEnv();
  if (nodeEnv === 'production') throw new Error('Refusing to reset database in production');

  const client = adminClient();
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(db.name)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdent(db.name)}`);
    console.log(`Database "${db.name}" recreated`);
  } finally {
    await client.end();
  }

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
  console.log('Migrations applied');

  if (process.argv.includes('--redis')) {
    const r = new Redis({
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      tls: redis.tls ? { host: redis.host } : undefined,
    });
    try {
      await r.flushdb();
      console.log(`Redis db ${redis.db} flushed`);
    } finally {
      await r.quit();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
