import { Module } from '@nestjs/common';
import { SparksController } from './sparks.controller';
import { SparksService } from './sparks.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [SparksController],
  providers: [SparksService, PrismaService],
  exports: [SparksService],
})
export class SparksModule {}
