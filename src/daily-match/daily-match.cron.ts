import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyMatchService } from './daily-match.service';
import { VibeService } from './vibe.service';
import { LoggerService } from '../common/logger.service';

/**
 * All Daily Match scheduling.
 *
 * Every job runs on a fixed UTC cadence and then filters per user by their own
 * timezone — there is no way to register a cron per timezone, and doing the
 * timezone maths inside the job keeps a single source of truth.
 */
@Injectable()
export class DailyMatchCron {
  constructor(
    private readonly matches: DailyMatchService,
    private readonly vibes: VibeService,
    private readonly logger: LoggerService,
  ) {}

  /** Core pairing pass. */
  @Cron('*/15 * * * *')
  async matchmaking() {
    try {
      await this.matches.runMatching(new Date());
    } catch (err) {
      this.logger.error('daily-match cron failed', { err: String(err) });
    }
  }

  /** Closes 24h windows: MUTUAL if both wrote, EXPIRED otherwise. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expiry() {
    try {
      await this.matches.processExpired(new Date());
    } catch (err) {
      this.logger.error('daily-match expiry failed', { err: String(err) });
    }
  }

  /** "Daily Match in 5 minutes" — fires 5 min before each user's local time. */
  @Cron('*/5 * * * *')
  async preMatchReminder() {
    try {
      await this.matches.sendReminders(
        new Date(), 5,
        '🔔 Daily Match через 5 минут',
        'Скоро познакомишься с новым человеком',
      );
    } catch (err) {
      this.logger.error('pre-match reminder failed', { err: String(err) });
    }
  }

  /** 5h after the match lands: nudge anyone who still hasn't written. */
  @Cron('0 * * * *')
  async silentReminder() {
    try {
      await this.matches.remindSilent(new Date());
    } catch (err) {
      this.logger.error('silent reminder failed', { err: String(err) });
    }
  }

  /** Vibe Check prompt at 10:00 local. */
  @Cron('*/15 * * * *')
  async vibePrompt() {
    try {
      await this.vibes.promptDailyVibe(new Date());
    } catch (err) {
      this.logger.error('vibe prompt failed', { err: String(err) });
    }
  }

  /** Clears yesterday's vibe at 09:00 local so the prompt is meaningful. */
  @Cron('*/15 * * * *')
  async vibeReset() {
    try {
      await this.vibes.resetStaleVibes(new Date());
    } catch (err) {
      this.logger.error('vibe reset failed', { err: String(err) });
    }
  }
}
