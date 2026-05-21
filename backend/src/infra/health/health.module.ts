import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { WahaModule } from '@app/integrations/waha/waha.module';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.indicator';
import { WahaHealthIndicator } from './waha.indicator';

@Module({
  imports: [TerminusModule, WahaModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, WahaHealthIndicator],
})
export class HealthModule {}
