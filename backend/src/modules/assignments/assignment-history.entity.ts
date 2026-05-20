import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AssignmentEvent {
  ASSIGNED = 'ASSIGNED',
  UNASSIGNED = 'UNASSIGNED',
  REASSIGNED = 'REASSIGNED',
}

@Entity({ name: 'assignment_history' })
@Index(['assignmentId', 'occurredAt'])
export class AssignmentHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  assignmentId!: string;

  @Column({ type: 'enum', enum: AssignmentEvent, enumName: 'assignment_event' })
  event!: AssignmentEvent;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;
}
