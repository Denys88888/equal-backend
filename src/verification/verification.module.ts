import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { UploadModule } from '../upload/upload.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [UploadModule, PrismaModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
