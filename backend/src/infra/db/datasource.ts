import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { loadEnv } from '@app/config/env';
import { buildDataSourceOptions } from './data-source-options';

loadDotenv();

const env = loadEnv();
const AppDataSource = new DataSource(buildDataSourceOptions(env));

export default AppDataSource;
