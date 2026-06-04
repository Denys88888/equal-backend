import { Module } from '@nestjs/common';
import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DiscoverController],
  providers: [DiscoverService, PrismaService],
})
export class DiscoverModule {}
