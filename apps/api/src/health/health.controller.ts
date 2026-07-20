import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}
  @Get('health') liveness() {
    return this.healthService.liveness();
  }
  @Get('ready') readiness() {
    return this.healthService.readiness();
  }
}
