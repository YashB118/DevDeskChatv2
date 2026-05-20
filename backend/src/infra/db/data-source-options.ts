import { join } from 'node:path';
import { type DataSourceOptions } from 'typeorm';
import { type AppConfig } from '@app/config/env';
import { SnakeNamingStrategy } from './naming';

const isTsRuntime = __filename.endsWith('.ts');
const srcRoot = isTsRuntime ? 'src' : 'dist/src';
const fileExt = isTsRuntime ? 'ts' : 'js';

export function buildDataSourceOptions(env: AppConfig): DataSourceOptions {
  const enableQueryLogging = env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace';

  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    synchronize: false,
    logging: enableQueryLogging
      ? ['error', 'warn', 'migration', 'query']
      : ['error', 'warn', 'migration'],
    namingStrategy: new SnakeNamingStrategy(),
    entities: [join(process.cwd(), srcRoot, `**/*.entity.${fileExt}`)],
    migrations: [join(process.cwd(), srcRoot, `infra/db/migrations/*.${fileExt}`)],
    migrationsTableName: 'typeorm_migrations',
    extra: {
      max: env.PG_POOL_MAX,
      idleTimeoutMillis: 30_000,
      statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
      idle_in_transaction_session_timeout: env.PG_IDLE_IN_TX_TIMEOUT_MS,
    },
    ssl: env.PG_SSL ? { rejectUnauthorized: true } : false,
  };
}
