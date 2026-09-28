import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

/** Which Settings toggle governs a notification. Omit for ones no toggle covers. */
export type NotifyCategory = 'matches' | 'messages' | 'events' | 'clubs';
const PREF_FIELD = {
  matches: 'notifyMatches',
  messages: 'notifyMessages',
  events: 'notifyEvents',
  clubs: 'notifyClubs',
} as const;

@Injectable()
export class PushService {
  constructor(private prisma: PrismaService) {
    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      webpush.setVapidDetails('mailto:noreply@equal.app', VAPID_PUBLIC, VAPID_PRIVATE);
    }
  }

  async saveSubscription(userId: string, subscription: object) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushSubscription: subscription },
    });
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string; tag?: string },
    category?: NotifyCategory,
  ) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushSubscription: true, ...(category && { [PREF_FIELD[category]]: true }) },
    }) as ({ pushSubscription: unknown } & Record<string, unknown>) | null;
    if (!user?.pushSubscription) return;
    // The user switched this category off in Settings.
    if (category && user[PREF_FIELD[category]] === false) return;
    try {
      await webpush.sendNotification(
        user.pushSubscription as unknown as webpush.PushSubscription,
        JSON.stringify(payload),
      );
    } catch {
      // subscription expired — clear it
      await this.prisma.user.update({ where: { id: userId }, data: { pushSubscription: null } });
    }
  }
}
