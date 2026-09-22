import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — lo que consulta Render' })
  check() {
    return this.healthService.check();
  }

  @Get('db')
  @ApiOperation({ summary: 'Readiness — comprueba la conexión a Postgres' })
  checkDatabase() {
    return this.healthService.checkDatabase();
  }
}
