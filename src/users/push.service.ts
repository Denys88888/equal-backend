import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

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

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { pushSubscription: true } });
    if (!user?.pushSubscription) return;
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
