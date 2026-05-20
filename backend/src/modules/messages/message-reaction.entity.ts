import { CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'message_reactions' })
@Index(['stanzaId'])
export class MessageReactionEntity {
  @PrimaryColumn({ type: 'text' })
  stanzaId!: string;

  @PrimaryColumn({ type: 'text' })
  senderJid!: string;

  @PrimaryColumn({ type: 'text' })
  emoji!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
