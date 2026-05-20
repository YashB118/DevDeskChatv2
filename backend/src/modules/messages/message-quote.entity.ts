import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'message_quotes' })
@Index(['quotedStanzaId'])
export class MessageQuoteEntity {
  @PrimaryColumn({ type: 'text' })
  stanzaId!: string;

  @Column({ type: 'text' })
  quotedStanzaId!: string;

  @Column({ type: 'text', nullable: true })
  quotedBody!: string | null;
}
