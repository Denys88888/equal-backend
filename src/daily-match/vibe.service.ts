import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../users/push.service';
import { isDue } from './daily-match.util';

/** Vibe is only meaningful for the day it was set. */
const VIBE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VibeService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  async getMyVibe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dailyVibe: true, vibeUpdatedAt: true },
    });
    if (!user) return { vibe: null, updatedAt: null };

    // A vibe older than its TTL is reported as absent even if the reset cron
    // hasn't reached this user yet — the read is the source of truth.
    const stale =
      !!user.vibeUpdatedAt && Date.now() - user.vibeUpdatedAt.getTime() > VIBE_TTL_MS;
    return {
      vibe: stale ? null : user.dailyVibe,
      updatedAt: stale ? null : user.vibeUpdatedAt,
    };
  }

  async setVibe(userId: string, vibe: 'deep' | 'flirt' | 'chat' | 'quiet') {
    await this.prisma.user.update({
      where: { id: userId },
      data: { dailyVibe: vibe, vibeUpdatedAt: new Date() },
    });
    return { vibe, updatedAt: new Date() };
  }

  /** 09:00 local — wipe yesterday's answer. */
  async resetStaleVibes(now = new Date()) {
    const users = await this.prisma.user.findMany({
      where: { dailyVibe: { not: null } },
      select: { id: true, timezone: true },
    });
    const ids = users.filter((u) => isDue(now, u.timezone, '09:00')).map((u) => u.id);
    if (ids.length === 0) return 0;
    await this.prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { dailyVibe: null, vibeUpdatedAt: null },
    });
    return ids.length;
  }

  /** 10:00 local — ask for today's vibe. */
  async promptDailyVibe(now = new Date()) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, dailyVibe: null },
      select: { id: true, timezone: true },
    });
    let sent = 0;
    for (const u of users) {
      if (!isDue(now, u.timezone, '10:00')) continue;
      this.push.sendToUser(u.id, {
        title: 'Какой у тебя настрой сегодня?',
        body: 'Выбери вайб — подберём match под него',
        url: '/#/daily-match',
        tag: 'vibe-check',
      }).catch(() => {});
      sent++;
    }
    return sent;
  }
}
