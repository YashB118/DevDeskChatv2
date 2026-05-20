import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'message_edits' })
@Index(['stanzaId', 'editedAt'])
export class MessageEditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  stanzaId!: string;

  @Column({ type: 'text', nullable: true })
  previousBody!: string | null;

  @Column({ type: 'text', nullable: true })
  newBody!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  editedAt!: Date;
}
