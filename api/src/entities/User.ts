import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BeforeInsert,
  BeforeUpdate,
  DeleteDateColumn,
} from 'typeorm';
import bcrypt from 'bcrypt';

@Entity('users')
export default class User {
  @PrimaryGeneratedColumn()
  _id: number;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  name: string;

  @Column()
  lastName: string;

  @Column({ type: 'text', nullable: true, default: null })
  phone: string | null;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true, default: null })
  updatedAt: Date | null;

  @DeleteDateColumn({ type: 'datetime', nullable: true, default: null })
  deletedAt: Date | null;

  @BeforeInsert()
  async hashPasswordOnInsert() {
    if (this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }

  @BeforeUpdate()
  async hashPasswordOnUpdate() {
    if (this.password && !this.password.startsWith('$2')) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    }
  }
}
