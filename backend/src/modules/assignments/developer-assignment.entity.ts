import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'developer_assignments' })
@Index(['chatId', 'isActive'])
@Index(['userId', 'isActive'])
@Index(['assignedBy', 'assignedAt'])
export class DeveloperAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 128 })
  chatId!: string;

  @Column({ type: 'uuid', nullable: true })
  wahaSessionId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'assigned_at' })
  assignedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  unassignedAt!: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
