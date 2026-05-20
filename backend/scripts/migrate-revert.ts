import AppDataSource from '../src/infra/db/datasource';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await AppDataSource.undoLastMigration({ transaction: 'each' });
    console.log('Last migration reverted.');
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
