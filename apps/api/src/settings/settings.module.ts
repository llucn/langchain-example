import { Global, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_ENV, type AppEnv } from '../config/env';
import { AppSetting } from '../database/entities/app-setting.entity';
import { SettingsAdminService } from './settings.admin.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/** Runtime settings: loaded before the Agent Config, which reads the effective values. */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [
    {
      provide: SettingsService,
      inject: [APP_ENV, DataSource],
      useFactory: async (env: AppEnv, dataSource: DataSource) => {
        const service = new SettingsService(env, dataSource.getRepository(AppSetting));
        await service.load();
        return service;
      },
    },
    SettingsAdminService,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
