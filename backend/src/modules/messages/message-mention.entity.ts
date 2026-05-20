import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'message_mentions' })
export class MessageMentionEntity {
  @PrimaryColumn({ type: 'text' })
  stanzaId!: string;

  @PrimaryColumn({ type: 'text' })
  mentionedJid!: string;
}
