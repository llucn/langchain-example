import { Column, Entity, PrimaryColumn } from 'typeorm';

/** An admin-stored override of a setting (see `runtime-settings`); `value` of a secret is encrypted. */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'boolean', default: false })
  secret: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  updatedBy: string | null;
}
