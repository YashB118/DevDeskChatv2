import { join } from 'node:path';
import { type DataSourceOptions } from 'typeorm';
import { type AppConfig } from '@app/config/env';
import { SnakeNamingStrategy } from './naming';

const isTsRuntime = __filename.endsWith('.ts');
const srcRoot = isTsRuntime ? 'src' : 'dist/src';
const fileExt = isTsRuntime ? 'ts' : 'js';

interface PgSslOptions {
  rejectUnauthorized: boolean;
  ca?: string;
}

function buildSslOptions(env: AppConfig): PgSslOptions | false {
  // TLS is enabled when either PG_SSL=true OR the connection string carries sslmode=require/verify-*.
  const urlForcesTls = /[?&]sslmode=(require|verify-ca|verify-full)/i.test(env.DATABASE_URL);
  if (!env.PG_SSL && !urlForcesTls) return false;

  const opts: PgSslOptions = {
    rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED,
  };
  if (env.PG_SSL_CA !== undefined) {
    opts.ca = env.PG_SSL_CA;
    // Pinned CA implies verification.
    opts.rejectUnauthorized = true;
  }
  return opts;
}

// `pg-connection-string` parses `sslmode=*` and builds its own ssl object that can
// override (or merge with) the one TypeORM forwards. Strip the param so our
// explicit options win cleanly.
function stripSslMode(url: string): string {
  return url
    .replace(/([?&])sslmode=[^&]*/gi, (_full: string, sep: string) => (sep === '?' ? '?' : ''))
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]$/, '');
}

export function buildDataSourceOptions(env: AppConfig): DataSourceOptions {
  const enableQueryLogging = env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace';
  const ssl = buildSslOptions(env);
  const url = ssl === false ? env.DATABASE_URL : stripSslMode(env.DATABASE_URL);

  return {
    type: 'postgres',
    url,
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
      ssl,
    },
    ssl,
  };
}
