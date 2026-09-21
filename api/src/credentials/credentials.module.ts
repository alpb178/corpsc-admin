import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CredentialsService } from './credentials.service';
import { CredentialsController } from './credentials.controller';

@Module({
  imports: [AuthModule],
  controllers: [CredentialsController],
  providers: [CredentialsService],
})
export class CredentialsModule {}
