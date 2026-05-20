import { type MigrationInterface, type QueryRunner } from 'typeorm';

// Schema for the chats/messages/sessions domain. Chats themselves live in WAHA;
// `chat_metadata` holds per-chat overrides + cache. `messages` is range-partitioned
// monthly by `sent_at`; a small SQL helper provisions next-month partitions on demand
// (called at boot and from the Phase-12 daily cron).
//
// Indexes follow BACKEND_IMPLEMENTATION_PLAN.md Phase 8 / §3-database considerations.
export class Messaging0003_1700000002000 implements MigrationInterface {
  name = 'Messaging0003_1700000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE session_status AS ENUM ('STARTING','SCAN_QR_CODE','WORKING','STOPPED','FAILED')
    `);
    await queryRunner.query(`
      CREATE TYPE message_type AS ENUM (
        'TEXT','IMAGE','VIDEO','AUDIO','DOCUMENT','STICKER','LOCATION',
        'CONTACT','SYSTEM','REACTION','UNKNOWN'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(128) NOT NULL UNIQUE,
        status session_status NOT NULL,
        config jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_sessions_status ON sessions (status)`);

    await queryRunner.query(`
      CREATE TABLE chat_metadata (
        chat_id varchar(128) PRIMARY KEY,
        display_name_override text,
        last_seen_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // messages: partitioned monthly. PK must include the partition column.
    await queryRunner.query(`
      CREATE TABLE messages (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        chat_id varchar(128) NOT NULL,
        stanza_id text NOT NULL,
        session_id uuid NULL REFERENCES sessions(id) ON DELETE SET NULL,
        from_jid text NOT NULL,
        from_me boolean NOT NULL DEFAULT false,
        body text,
        type message_type NOT NULL,
        row_id bigint,
        sent_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id, sent_at),
        UNIQUE (stanza_id, sent_at)
      ) PARTITION BY RANGE (sent_at)
    `);
    await queryRunner.query(
      `CREATE INDEX idx_messages_chat_sent ON messages (chat_id, sent_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_messages_session_sent ON messages (session_id, sent_at DESC)`,
    );
    await queryRunner.query(`CREATE INDEX idx_messages_sent_brin ON messages USING BRIN (sent_at)`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_messages_partition(target_month date)
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      DECLARE
        start_ts timestamptz := date_trunc('month', target_month);
        end_ts timestamptz := date_trunc('month', target_month) + interval '1 month';
        part_name text := format('messages_%s', to_char(start_ts, 'YYYY_MM'));
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF messages FOR VALUES FROM (%L) TO (%L)',
          part_name, start_ts, end_ts
        );
      END;
      $$
    `);

    await queryRunner.query(`SELECT ensure_messages_partition(date_trunc('month', now())::date)`);
    await queryRunner.query(
      `SELECT ensure_messages_partition((date_trunc('month', now()) + interval '1 month')::date)`,
    );
    await queryRunner.query(
      `SELECT ensure_messages_partition((date_trunc('month', now()) + interval '2 month')::date)`,
    );

    // Children of `messages` don't carry FKs back — Postgres doesn't allow FKs
    // to a partitioned table on a non-unique column. Stanza-id is unique within
    // a partition window, so reactions/edits/etc. reference stanza_id directly.
    await queryRunner.query(`
      CREATE TABLE message_reactions (
        stanza_id text NOT NULL,
        sender_jid text NOT NULL,
        emoji text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (stanza_id, sender_jid, emoji)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_message_reactions_stanza ON message_reactions (stanza_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE message_edits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        stanza_id text NOT NULL,
        previous_body text,
        new_body text,
        edited_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_message_edits_stanza_at ON message_edits (stanza_id, edited_at DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE deleted_messages (
        stanza_id text PRIMARY KEY,
        deleted_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE message_mentions (
        stanza_id text NOT NULL,
        mentioned_jid text NOT NULL,
        PRIMARY KEY (stanza_id, mentioned_jid)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE message_quotes (
        stanza_id text PRIMARY KEY,
        quoted_stanza_id text NOT NULL,
        quoted_body text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_message_quotes_quoted ON message_quotes (quoted_stanza_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS message_quotes');
    await queryRunner.query('DROP TABLE IF EXISTS message_mentions');
    await queryRunner.query('DROP TABLE IF EXISTS deleted_messages');
    await queryRunner.query('DROP TABLE IF EXISTS message_edits');
    await queryRunner.query('DROP TABLE IF EXISTS message_reactions');
    await queryRunner.query('DROP FUNCTION IF EXISTS ensure_messages_partition(date)');
    await queryRunner.query('DROP TABLE IF EXISTS messages');
    await queryRunner.query('DROP TABLE IF EXISTS chat_metadata');
    await queryRunner.query('DROP TABLE IF EXISTS sessions');
    await queryRunner.query('DROP TYPE IF EXISTS message_type');
    await queryRunner.query('DROP TYPE IF EXISTS session_status');
  }
}
