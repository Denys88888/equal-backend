import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { PushKey, pushText } from '../common/push-texts';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

/**
 * A push, written as keys so it can be rendered in the recipient's language.
 * `body` may instead carry literal text (a chat message preview). A `name`
 * param left empty renders as "Someone" in that language.
 */
export interface PushMessage {
  title: PushKey;
  body: PushKey | { text: string };
  params?: Record<string, string | number | null | undefined>;
  url?: string;
  tag?: string;
}

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

  /** Turn keys into text in `locale` (English when unknown). */
  render(message: PushMessage, locale?: string | null) {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(message.params ?? {})) params[k] = v ?? '';
    if ('name' in params && !params.name) params.name = pushText(locale, 'someone');
    return {
      title: pushText(locale, message.title, params),
      body: typeof message.body === 'string' ? pushText(locale, message.body, params) : message.body.text,
      ...(message.url && { url: message.url }),
      ...(message.tag && { tag: message.tag }),
    };
  }

  async saveSubscription(userId: string, subscription: object) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushSubscription: subscription },
    });
  }

  async sendToUser(userId: string, message: PushMessage, category?: NotifyCategory) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushSubscription: true, locale: true, ...(category && { [PREF_FIELD[category]]: true }) },
    }) as ({ pushSubscription: unknown; locale?: string } & Record<string, unknown>) | null;
    if (!user?.pushSubscription) return;
    // The user switched this category off in Settings.
    if (category && user[PREF_FIELD[category]] === false) return;

    const payload = this.render(message, user.locale);
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
