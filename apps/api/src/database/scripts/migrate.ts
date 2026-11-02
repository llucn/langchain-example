import dataSource from '../data-source';

// Arbitrary constant shared by all instances so concurrent deploy hooks serialize.
const MIGRATION_LOCK_ID = 7_345_001;

/** Applies pending migrations under a PostgreSQL advisory lock (safe to run on every instance). */
async function main() {
  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  try {
    await runner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    const applied = await dataSource.runMigrations();
    console.log(`Migrations applied: ${applied.length}`);
  } finally {
    await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
