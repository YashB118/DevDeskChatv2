import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Pool } from 'pg';
import { pgPoolActive, pgPoolIdle, pgPoolWaiting } from './metrics.registry';

interface PgPoolHandle {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

/**
 * Polls the underlying `pg` pool counters every 5 seconds and writes them
 * onto the Prometheus gauges. `totalCount = active + idle`, so the active
 * gauge is derived by subtraction. The pool handle lives on the TypeORM
 * driver's master instance.
 */
@Injectable()
export class PostgresPoolCollector implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): void {
    this.tick();
    this.timer = setInterval(() => {
      this.tick();
    }, 5000);
    // Letting the interval block process exit defeats `enableShutdownHooks`.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  private tick(): void {
    const pool = this.findPool();
    if (pool === null) return;
    pgPoolIdle.set(pool.idleCount);
    pgPoolWaiting.set(pool.waitingCount);
    pgPoolActive.set(Math.max(0, pool.totalCount - pool.idleCount));
  }

  private findPool(): PgPoolHandle | null {
    // `dataSource.driver.master` is typed as `unknown` because TypeORM
    // abstracts over multiple drivers. Casting through a narrow shape keeps
    // the type assertion local.
    const driver = this.dataSource.driver as { master?: unknown } | undefined;
    const candidate = driver?.master;
    if (candidate === null || candidate === undefined || typeof candidate !== 'object') {
      return null;
    }
    const pool = candidate as Partial<Pool>;
    if (
      typeof pool.totalCount !== 'number' ||
      typeof pool.idleCount !== 'number' ||
      typeof pool.waitingCount !== 'number'
    ) {
      return null;
    }
    return {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };
  }
}
