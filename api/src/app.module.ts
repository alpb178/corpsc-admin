import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { throttlerOptions } from './common/throttle';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { CredentialsModule } from './credentials/credentials.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MetricsModule } from './metrics/metrics.module';
import { RecordsModule } from './records/records.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Not a global guard: only ingestion and login are throttled, each with
    // its own guard (src/common/throttle.ts).
    ThrottlerModule.forRoot(throttlerOptions()),
    PrismaModule,
    CommonModule,
    AuthModule,
    ProjectsModule,
    CredentialsModule,
    IngestionModule,
    MetricsModule,
    RecordsModule,
    HealthModule,
  ],
})
export class AppModule {}
