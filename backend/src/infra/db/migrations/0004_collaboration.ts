import { type MigrationInterface, type QueryRunner } from 'typeorm';

// Schema for collaboration: developer assignments + history, chat/global mutes,
// and feedback. Assignment uniqueness is a partial index so the same
// (user_id, chat_id) pair can appear multiple times historically but only
// once with is_active = true.
//
// Schema mirrors BACKEND_IMPLEMENTATION_PLAN.md Phase 9 / §3-database considerations.
export class Collaboration0004_1700000003000 implements MigrationInterface {
  name = 'Collaboration0004_1700000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE assignment_event AS ENUM ('ASSIGNED','UNASSIGNED','REASSIGNED')
    `);

    await queryRunner.query(`
      CREATE TABLE developer_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id varchar(128) NOT NULL,
        waha_session_id uuid NULL REFERENCES sessions(id) ON DELETE SET NULL,
        assigned_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        unassigned_at timestamptz NULL,
        is_active boolean NOT NULL DEFAULT true
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_developer_assignments_user_chat_active
       ON developer_assignments (user_id, chat_id) WHERE is_active = true`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_developer_assignments_chat_active
       ON developer_assignments (chat_id, is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_developer_assignments_user_active
       ON developer_assignments (user_id, is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_developer_assignments_assigned_by_at
       ON developer_assignments (assigned_by, assigned_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE assignment_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id uuid NOT NULL REFERENCES developer_assignments(id) ON DELETE CASCADE,
        event assignment_event NOT NULL,
        actor_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        payload jsonb,
        occurred_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_assignment_history_assignment_at
       ON assignment_history (assignment_id, occurred_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE chat_mutes (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id varchar(128) NOT NULL,
        muted_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, chat_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE global_mutes (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        body text NOT NULL,
        read boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_feedback_user_created ON feedback (user_id, created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_feedback_unread_created
       ON feedback (read, created_at DESC) WHERE read = false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS feedback');
    await queryRunner.query('DROP TABLE IF EXISTS global_mutes');
    await queryRunner.query('DROP TABLE IF EXISTS chat_mutes');
    await queryRunner.query('DROP TABLE IF EXISTS assignment_history');
    await queryRunner.query('DROP TABLE IF EXISTS developer_assignments');
    await queryRunner.query('DROP TYPE IF EXISTS assignment_event');
  }
}
