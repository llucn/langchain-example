import dataSource from '../data-source';
import { User } from '../entities/user.entity';

async function main() {
  await dataSource.initialize();
  const repo = dataSource.getRepository(User);
  await repo.upsert({ sub: 'seed-user', email: 'seed@example.com' }, ['sub']);
  console.log(`Seeded. users=${await repo.count()}`);
  await dataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
