import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'chat_metadata' })
export class ChatMetadataEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  chatId!: string;

  @Column({ type: 'text', nullable: true })
  displayNameOverride!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
