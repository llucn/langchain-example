import { spawnSync } from 'node:child_process';

// Usage: pnpm migration:generate <Name>  ->  src/database/migrations/<timestamp>-<Name>.ts
const name = process.argv[2];
if (!name) {
  console.error('Usage: pnpm migration:generate <MigrationName>');
  process.exit(1);
}
const r = spawnSync(
  process.execPath,
  [
    '-r',
    'ts-node/register',
    require.resolve('typeorm/cli.js'),
    'migration:generate',
    '-d',
    'src/database/data-source.ts',
    `src/database/migrations/${name}`,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
