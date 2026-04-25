import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('blacklist')
export default class BlackList {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  userId: number;

  @Column()
  hash: string;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;
}
