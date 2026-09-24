import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { VisitorsService } from './visitors.service';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule, IngestionModule],
  controllers: [MetricsController],
  providers: [MetricsService, VisitorsService, RealtimeService],
  exports: [MetricsService],
})
export class MetricsModule {}
