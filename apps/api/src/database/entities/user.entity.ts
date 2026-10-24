import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** OIDC subject (Cognito `sub`). */
  @Column({ type: 'varchar', unique: true })
  sub: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
