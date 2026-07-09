import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const EARN_REWARDS: Record<string, number> = {
  verification: 5,
  complete_profile: 3,
  date_feedback: 2,
  club_activity: 1,
  invite_friend: 10,
};

@Injectable()
export class SparksService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { sparkBalance: true } });
    return { balance: user?.sparkBalance || 0 };
  }

  async earn(userId: string, action: string) {
    const earned = EARN_REWARDS[action] || 0;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { sparkBalance: { increment: earned } },
    });
    return { earned, newBalance: user.sparkBalance };
  }

  async spend(userId: string, amount: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { sparkBalance: true } });
    if (!user || user.sparkBalance < amount) throw new BadRequestException('Not enough sparks');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { sparkBalance: { decrement: amount } },
    });
    return { spent: amount, newBalance: updated.sparkBalance };
  }
}
