import AppDataSource from '../src/infra/db/datasource';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const applied = await AppDataSource.runMigrations({ transaction: 'each' });
    if (applied.length === 0) {
      console.log('No pending migrations.');
    } else {
      for (const m of applied) {
        console.log(`Applied: ${m.name}`);
      }
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
