import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

export type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
}

@Injectable()
export class TransactionRunner {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(
    fn: (manager: EntityManager) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return withTransaction(this.dataSource, fn, options);
  }
}

export async function withTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  if (options?.isolationLevel !== undefined) {
    await queryRunner.startTransaction(options.isolationLevel);
  } else {
    await queryRunner.startTransaction();
  }
  try {
    const result = await fn(queryRunner.manager);
    await queryRunner.commitTransaction();
    return result;
  } catch (err) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await queryRunner.release();
  }
}
