import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [AuthModule, IngestionModule],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
