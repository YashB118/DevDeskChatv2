import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class Init0001_1700000000000 implements MigrationInterface {
  name = 'Init0001_1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "pgcrypto"');
  }
}
