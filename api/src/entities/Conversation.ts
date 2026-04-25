import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn, Index } from 'typeorm';

@Entity('conversations')
@Index(['agentId', 'sessionKey'], { unique: true, where: 'sessionKey IS NOT NULL' })
export default class Conversation {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  agentId: number;

  @Column({ type: 'text', nullable: true, default: null })
  title: string | null;

  @Column({ type: 'text', nullable: true, default: null })
  sessionKey: string | null;

  @Column()
  createdBy: number;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @DeleteDateColumn({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;
}
