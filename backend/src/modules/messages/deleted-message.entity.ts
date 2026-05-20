import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'deleted_messages' })
export class DeletedMessageEntity {
  @PrimaryColumn({ type: 'text' })
  stanzaId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  deletedAt!: Date;
}
