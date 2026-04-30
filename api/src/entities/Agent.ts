import { Entity, PrimaryGeneratedColumn, Column, DeleteDateColumn } from 'typeorm';

/**
 * One DB row per Hermes profile we manage from this client.
 * `hermesProfile` is the canonical profile name passed via `hermes -p <name>`.
 * `name` is the human-friendly label shown in the UI; it usually matches the
 * profile name but may diverge after rename.
 */
@Entity('agents')
export default class Agent {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column()
  name: string;

  @Column({ default: 'default' })
  hermesProfile: string;

  @Column()
  createdBy: number;

  @Column({ type: 'real', nullable: true, default: null })
  dailyCapUsd: number | null;

  @Column({ type: 'real', nullable: true, default: null })
  monthlyCapUsd: number | null;

  @Column({ type: 'real', nullable: true, default: null })
  allTimeCapUsd: number | null;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;
}
