import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn, Index } from 'typeorm';

@Entity('messages')
@Index(['conversationId', 'externalId'], { unique: true, where: 'externalId IS NOT NULL' })
export default class Message {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  conversationId: number;

  @Column({ type: 'text', nullable: true, default: null })
  externalId: string | null;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'text', nullable: true, default: null })
  thinking: string | null;

  @Column({ type: 'simple-json', default: '[]' })
  files: { filename: string; originalName: string; mimetype: string; size: number; url: string }[];

  @Column({ type: 'text', default: 'user' })
  role: 'user' | 'assistant';

  @Column()
  createdBy: number;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @DeleteDateColumn({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;
}
