import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from './api-key.guard';
import { FactWriterService } from './fact-writer.service';
import { FreshnessService } from './freshness.service';
import { SiteEventsService } from './site-events.service';
import { EventRollupService } from './event-rollup.service';

@Module({
  imports: [AuthModule],
  controllers: [IngestController],
  providers: [
    IngestService,
    ApiKeyGuard,
    FactWriterService,
    FreshnessService,
    SiteEventsService,
    EventRollupService,
  ],
  exports: [FreshnessService],
})
export class IngestionModule {}
