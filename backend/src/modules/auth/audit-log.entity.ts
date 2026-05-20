import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// `audit_log` is a Postgres RANGE-partitioned table on `created_at`.
// PK must include the partition key, so both id and createdAt are PK columns.
@Entity({ name: 'audit_log' })
@Index(['userId', 'createdAt'])
@Index(['event', 'createdAt'])
export class AuditLogEntity {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'text' })
  event!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;
}
