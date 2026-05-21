import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { PostgresPoolCollector } from './postgres-pool.collector';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsInterceptor, PostgresPoolCollector],
  exports: [MetricsInterceptor],
})
export class MetricsModule {}
