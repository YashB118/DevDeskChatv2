import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'chat_mutes' })
export class ChatMuteEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 128 })
  chatId!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'muted_at' })
  mutedAt!: Date;
}
