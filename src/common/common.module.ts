import { Global, Module } from '@nestjs/common';
import { BannedGuard } from './banned.guard';
import { ProfanityService } from './profanity.service';
import { LoggerService } from './logger.service';

/**
 * Global so BannedGuard / ProfanityService / LoggerService can be injected
 * anywhere without every feature module re-importing them.
 */
@Global()
@Module({
  providers: [BannedGuard, ProfanityService, LoggerService],
  exports: [BannedGuard, ProfanityService, LoggerService],
})
export class CommonModule {}
