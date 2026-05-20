import { type DataSource } from 'typeorm';

/**
 * Provisions monthly partitions for the time-series tables. Both helpers
 * are idempotent — `CREATE TABLE IF NOT EXISTS` guards repeat runs. Called
 * at boot (via `OnApplicationBootstrap`) and from a daily cron in Phase 12.
 */
export async function ensureMessagesPartitionsForNextMonths(
  dataSource: DataSource,
  monthsAhead = 2,
): Promise<void> {
  for (let i = 0; i <= monthsAhead; i += 1) {
    await dataSource.query(
      `SELECT ensure_messages_partition((date_trunc('month', now()) + ($1 || ' month')::interval)::date)`,
      [String(i)],
    );
  }
}

export async function ensureAuditLogPartitionsForNextMonths(
  dataSource: DataSource,
  monthsAhead = 2,
): Promise<void> {
  for (let i = 0; i <= monthsAhead; i += 1) {
    await dataSource.query(
      `SELECT ensure_audit_log_partition((date_trunc('month', now()) + ($1 || ' month')::interval)::date)`,
      [String(i)],
    );
  }
}
