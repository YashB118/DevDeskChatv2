import { type MigrationInterface, type QueryRunner } from 'typeorm';

// Initial three monthly partitions of `audit_log` plus a helper function that
// callers (Phase 12 CronJob, bootstrap check) invoke to materialize future
// partitions ahead of time.
//
// Schema mirrors BACKEND_IMPLEMENTATION_PLAN.md Phase 3 / §3-database considerations.
export class Auth0002_1700000001000 implements MigrationInterface {
  name = 'Auth0002_1700000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "citext"');

    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM ('ADMIN', 'DEVELOPER')
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        password_hash text NOT NULL,
        role user_role NOT NULL,
        display_name text NOT NULL,
        disabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_users_active ON users (disabled) WHERE disabled = false`,
    );

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash text NOT NULL,
        issued_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        replaced_by uuid NULL REFERENCES refresh_tokens(id) ON DELETE SET NULL,
        revoked boolean NOT NULL DEFAULT false
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_user_revoked ON refresh_tokens (user_id, revoked)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_refresh_tokens_expires_active ON refresh_tokens (expires_at) WHERE revoked = false`,
    );

    // audit_log is range-partitioned by created_at. The PK must include the
    // partition key (created_at) because Postgres requires it.
    await queryRunner.query(`
      CREATE TABLE audit_log (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        event text NOT NULL,
        payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);
    await queryRunner.query(
      `CREATE INDEX idx_audit_log_user_created ON audit_log (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_audit_log_event_created ON audit_log (event, created_at DESC)`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_audit_log_partition(target_month date)
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      DECLARE
        start_ts timestamptz := date_trunc('month', target_month);
        end_ts timestamptz := date_trunc('month', target_month) + interval '1 month';
        part_name text := format('audit_log_%s', to_char(start_ts, 'YYYY_MM'));
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
          part_name, start_ts, end_ts
        );
      END;
      $$
    `);

    // Materialize the current month plus two ahead so a fresh install can write
    // immediately and a daily cron has buffer to catch up.
    await queryRunner.query(`SELECT ensure_audit_log_partition(date_trunc('month', now())::date)`);
    await queryRunner.query(
      `SELECT ensure_audit_log_partition((date_trunc('month', now()) + interval '1 month')::date)`,
    );
    await queryRunner.query(
      `SELECT ensure_audit_log_partition((date_trunc('month', now()) + interval '2 month')::date)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP FUNCTION IF EXISTS ensure_audit_log_partition(date)');
    await queryRunner.query('DROP TABLE IF EXISTS audit_log');
    await queryRunner.query('DROP TABLE IF EXISTS refresh_tokens');
    await queryRunner.query('DROP TABLE IF EXISTS users');
    await queryRunner.query('DROP TYPE IF EXISTS user_role');
  }
}
