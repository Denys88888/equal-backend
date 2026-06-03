import { Module } from '@nestjs/common';
import { SparksController } from './sparks.controller';
import { SparksService } from './sparks.service';

@Module({
  controllers: [SparksController],
  providers: [SparksService],
})
export class SparksModule {}
