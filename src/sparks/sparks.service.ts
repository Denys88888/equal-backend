import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SparkActivityType =
  | 'LOGIN'
  | 'PROFILE_COMPLETE'
  | 'VERIFICATION'
  | 'REFERRAL'
  | 'DAILY_BONUS';

interface SparkTransaction {
  id: string;
  activityType: SparkActivityType;
  amount: number;
  createdAt: Date;
}

interface UserWithBalance {
  id: string;
  sparkBalance: number;
}

const ACTIVITY_REWARDS: Record<SparkActivityType, number> = {
  LOGIN: 5,
  PROFILE_COMPLETE: 50,
  VERIFICATION: 100,
  REFERRAL: 25,
  DAILY_BONUS: 10,
};

@Injectable()
export class SparksService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    const user: UserWithBalance | null = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sparkBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.sparkBalance;
  }

  async earnSparks(
    userId: string,
    activityType: SparkActivityType,
  ): Promise<number> {
    const user: UserWithBalance | null = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sparkBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const amount: number = ACTIVITY_REWARDS[activityType];
    if (amount === undefined) {
      throw new BadRequestException(`Unknown activity type: ${activityType}`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { sparkBalance: { increment: amount } },
      select: { sparkBalance: true },
    });

    return updatedUser.sparkBalance;
  }

  async spendSparks(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<number> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const user: UserWithBalance | null = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sparkBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.sparkBalance < amount) {
      throw new BadRequestException('Insufficient spark balance');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { sparkBalance: { decrement: amount } },
      select: { sparkBalance: true },
    });

    return updatedUser.sparkBalance;
  }

  async getTransactions(userId: string): Promise<SparkTransaction[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return [
      {
        id: 'mock-txn-001',
        activityType: 'DAILY_BONUS' as SparkActivityType,
        amount: 10,
        createdAt: new Date(),
      },
      {
        id: 'mock-txn-002',
        activityType: 'LOGIN' as SparkActivityType,
        amount: 5,
        createdAt: new Date(Date.now() - 86400000),
      },
    ];
  }
}
