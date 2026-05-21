import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.indicator';
import { WahaHealthIndicator } from './waha.indicator';

interface LivenessResponse {
  status: 'ok';
  uptimeSeconds: number;
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly waha: WahaHealthIndicator,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): LivenessResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 2000 }),
      () => this.redis.pingCheck('redis'),
      () => this.waha.pingCheck('waha'),
    ]);
  }
}
