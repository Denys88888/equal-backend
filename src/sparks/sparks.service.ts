import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Earn rules. `once` actions can be claimed a single time ever; the rest are
 * capped per calendar day. Every claim is written to the SparkEarn ledger with a
 * unique dedupeKey, so a concurrent double-claim collides on the DB constraint
 * instead of minting twice.
 */
const EARN_RULES: Record<string, { amount: number; once: boolean; dailyCap?: number }> = {
  verification: { amount: 5, once: true },
  complete_profile: { amount: 3, once: true },
  date_feedback: { amount: 2, once: false, dailyCap: 3 },
  club_activity: { amount: 1, once: false, dailyCap: 5 },
};

@Injectable()
export class SparksService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { sparkBalance: true } });
    return { balance: user?.sparkBalance || 0 };
  }

  /** Server-side proof that the user actually did the thing they're claiming for. */
  private async isEligible(userId: string, action: string): Promise<boolean> {
    if (action === 'verification') {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { verified: true } });
      return !!user?.verified;
    }
    if (action === 'complete_profile') {
      const profile = await this.prisma.profile.findUnique({
        where: { userId },
        select: { profileComplete: true },
      });
      return !!profile?.profileComplete;
    }
    if (action === 'club_activity') {
      const posts = await this.prisma.clubPost.count({ where: { authorId: userId } });
      return posts > 0;
    }
    // date_feedback has no verifiable server-side artifact yet; allowed but daily-capped.
    return true;
  }

  async earn(userId: string, action: string) {
    const rule = EARN_RULES[action];
    if (!rule) throw new BadRequestException('Unknown action');

    if (!(await this.isEligible(userId, action))) {
      throw new BadRequestException(`Not eligible for "${action}" yet`);
    }

    let dedupeKey: string;
    if (rule.once) {
      dedupeKey = `${userId}:${action}`;
    } else {
      const day = new Date().toISOString().slice(0, 10);
      const startOfDay = new Date(`${day}T00:00:00.000Z`);
      const todayCount = await this.prisma.sparkEarn.count({
        where: { userId, action, createdAt: { gte: startOfDay } },
      });
      if (rule.dailyCap !== undefined && todayCount >= rule.dailyCap) {
        throw new BadRequestException(`Daily limit reached for "${action}"`);
      }
      dedupeKey = `${userId}:${action}:${day}:${todayCount}`;
    }

    try {
      const [, user] = await this.prisma.$transaction([
        this.prisma.sparkEarn.create({
          data: { userId, action, amount: rule.amount, dedupeKey },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { sparkBalance: { increment: rule.amount } },
        }),
      ]);
      return { earned: rule.amount, newBalance: user.sparkBalance };
    } catch (e) {
      // Unique violation on dedupeKey == already claimed (or a lost race). Fail closed.
      if ((e as { code?: string }).code === 'P2002') {
        throw new BadRequestException(`Reward for "${action}" already claimed`);
      }
      throw e;
    }
  }

  async spend(userId: string, amount: number) {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer');
    }
    // Conditional update: only decrements when the balance actually covers it,
    // so two concurrent spends can't both pass a read-then-write check.
    const res = await this.prisma.user.updateMany({
      where: { id: userId, sparkBalance: { gte: amount } },
      data: { sparkBalance: { decrement: amount } },
    });
    if (res.count === 0) throw new BadRequestException('Not enough sparks');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { sparkBalance: true } });
    return { spent: amount, newBalance: user?.sparkBalance ?? 0 };
  }
}
