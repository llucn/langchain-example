import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_ENV, AppEnv } from '../config/env';
import { buildDataSourceOptions } from './data-source-options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => buildDataSourceOptions(env),
    }),
  ],
})
export class DatabaseModule {}
