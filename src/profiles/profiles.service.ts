import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  async discover(userId: string, filters: Record<string, string>) {
    const excludeIds = [userId];
    const alreadySwiped = await this.prisma.swipeAction.findMany({
      where: { userId },
      select: { targetId: true },
    });
    excludeIds.push(...alreadySwiped.map((s: { targetId: string }) => s.targetId));

    const profiles = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        profile: { gender: { not: null } },
      },
      take: 20,
      include: { profile: true, photos: { orderBy: { order: 'asc' }, take: 1 } },
    });

    return profiles.map((user: any) => ({
      id: user.id,
      name: user.name,
      age: user.profile?.birthDate
        ? Math.floor((Date.now() - new Date(user.profile.birthDate).getTime()) / 31536000000)
        : null,
      distance: null,
      compatibility: 80,
      photo: user.photos[0]?.url || '',
      bio: user.profile?.bio || '',
      interests: user.profile?.interests || [],
      verified: user.verified,
    }));
  }

  async swipe(userId: string, targetUserId: string, action: string) {
    await this.prisma.swipeAction.upsert({
      where: { userId_targetId: { userId, targetId: targetUserId } },
      update: { action },
      create: { userId, targetId: targetUserId, action },
    });

    if (action === 'like' || action === 'spark') {
      const theyLikedUs = await this.prisma.swipeAction.findFirst({
        where: { userId: targetUserId, targetId: userId, action: { in: ['like', 'spark'] } },
      });
      if (theyLikedUs) {
        const [u1, u2] = [userId, targetUserId].sort();
        const existing = await this.prisma.match.findFirst({ where: { user1Id: u1, user2Id: u2 } });
        if (!existing) {
          await this.prisma.match.create({ data: { user1Id: u1, user2Id: u2 } });
          return { success: true, isMatch: true };
        }
      }
    }
    return { success: true, isMatch: false };
  }
}
