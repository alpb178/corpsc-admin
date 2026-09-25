import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  // AuthModule for the guards; IngestionModule for the rollup that recomputes what is left.
  imports: [AuthModule, IngestionModule],
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
