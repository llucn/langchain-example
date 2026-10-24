import { loadEnv } from '../../config/env';
import { adminClient, quoteIdent } from './admin-client';

async function main() {
  const name = loadEnv().db.name;
  const client = adminClient();
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) {
      console.log(`Database "${name}" already exists`);
    } else {
      await client.query(`CREATE DATABASE ${quoteIdent(name)}`);
      console.log(`Database "${name}" created`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
