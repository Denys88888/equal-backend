import { Module } from '@nestjs/common';
import { DailyMatchService } from './daily-match.service';
import { DailyMatchController } from './daily-match.controller';
import { VibeService } from './vibe.service';
import { VibeController } from './vibe.controller';
import { DailyMatchCron } from './daily-match.cron';
import { UsersModule } from '../users/users.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [UsersModule, GatewayModule],
  controllers: [DailyMatchController, VibeController],
  providers: [DailyMatchService, VibeService, DailyMatchCron],
  exports: [DailyMatchService, VibeService],
})
export class DailyMatchModule {}
