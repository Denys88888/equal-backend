import { Module } from '@nestjs/common';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ClubsController],
  providers: [ClubsService, PrismaService],
  exports: [ClubsService],
})
export class ClubsModule {}
