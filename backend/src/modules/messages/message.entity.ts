import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { MessageTypeValues, type MessageType } from './message.types';

const bigintTransformer = {
  from(value: string | null): number | null {
    return value === null ? null : Number(value);
  },
  to(value: number | null): string | null {
    return value === null ? null : String(value);
  },
};

// Composite PK (id, sent_at): Postgres requires the partition key in the PK.
@Entity({ name: 'messages' })
@Index(['chatId', 'sentAt'])
export class MessageEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  chatId!: string;

  @Column({ type: 'text' })
  stanzaId!: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'text' })
  fromJid!: string;

  @Column({ type: 'boolean', default: false })
  fromMe!: boolean;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'enum', enum: MessageTypeValues, enumName: 'message_type' })
  type!: MessageType;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  rowId!: number | null;

  @PrimaryColumn({ type: 'timestamptz' })
  sentAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
