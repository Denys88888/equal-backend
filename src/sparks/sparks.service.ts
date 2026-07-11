import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EARN_REWARDS: Record<string, number> = {
  verification: 5,
  complete_profile: 3,
  date_feedback: 2,
  club_activity: 1,
  invite_friend: 10,
};

// Actions that can only be earned once ever
const ONE_TIME_ACTIONS = new Set(['verification', 'complete_profile', 'invite_friend']);
// Actions limited to once per 24 h
const DAILY_ACTIONS = new Set(['date_feedback', 'club_activity']);

@Injectable()
export class SparksService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sparkBalance: true },
    });
    return { balance: user?.sparkBalance || 0 };
  }

  async earn(userId: string, action: string) {
    const earned = EARN_REWARDS[action];
    if (!earned) throw new BadRequestException(`Unknown action: ${action}`);

    if (ONE_TIME_ACTIONS.has(action)) {
      const existing = await this.prisma.sparkEarnLog.findFirst({ where: { userId, action } });
      if (existing) throw new BadRequestException(`Action '${action}' can only be earned once`);
    } else if (DAILY_ACTIONS.has(action)) {
      const since = new Date(Date.now() - 86_400_000);
      const recent = await this.prisma.sparkEarnLog.findFirst({
        where: { userId, action, earnedAt: { gte: since } },
      });
      if (recent) throw new BadRequestException(`Action '${action}' can only be earned once per day`);
    }

    await this.prisma.sparkEarnLog.create({ data: { userId, action } });
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { sparkBalance: { increment: earned } },
    });
    return { earned, newBalance: user.sparkBalance };
  }
}
