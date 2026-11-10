import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { DatabaseHealthIndicator } from './database-health.indicator.js';

@Controller('health')
@Public()
@SkipThrottle({
  default: true,
  register: true,
  login: true,
  refresh: true,
  'refresh-token': true,
  logout: true,
})
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.healthIndicatorService.check('application').up(),
      () => this.database.isHealthy(),
    ]);
  }
}
