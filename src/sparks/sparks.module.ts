import { Global, Module } from '@nestjs/common';
import { SparksController } from './sparks.controller';
import { SparksService } from './sparks.service';
import { RewardsService } from './rewards.service';

// Global so profiles, users, clubs, verification and admin can grant rewards
// at the moment the rewarded thing happens.
@Global()
@Module({
  controllers: [SparksController],
  providers: [SparksService, RewardsService],
  exports: [SparksService, RewardsService],
})
export class SparksModule {}
