import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
@Index(['familyId'])
@Index(['userId', 'revoked'])
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'text' })
  tokenHash!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'issued_at' })
  issuedAt!: Date;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  replacedBy!: string | null;

  @Column({ type: 'boolean', default: false })
  revoked!: boolean;
}
