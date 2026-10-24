// TypeORM CLI entry (migration:run / migration:revert / migration:generate)
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env';
import { buildDataSourceOptions } from './data-source-options';

export default new DataSource(buildDataSourceOptions(loadEnv()));
