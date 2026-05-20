import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { buildDataSourceOptions } from './data-source-options';
import { TransactionRunner } from './transactions';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (env: AppConfig) => buildDataSourceOptions(env),
    }),
  ],
  providers: [TransactionRunner],
  exports: [TypeOrmModule, TransactionRunner],
})
export class DatabaseModule {}
