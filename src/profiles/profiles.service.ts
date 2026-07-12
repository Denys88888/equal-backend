import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { PushService } from '../users/push.service';

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
    private push: PushService,
  ) {}

  async getProfile(userId: string) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  async discover(userId: string, _filters: Record<string, string>) {
    const excludeIds = [userId];
    const alreadySwiped = await this.prisma.swipeAction.findMany({
      where: { userId },
      select: { targetId: true },
    });
    excludeIds.push(...alreadySwiped.map((s: { targetId: string }) => s.targetId));

    const profiles = await this.prisma.user.findMany({
      where: { id: { notIn: excludeIds } },
      take: 20,
      include: { profile: true, photos: { orderBy: { order: 'asc' } } },
    });

    return profiles.map((user: any) => ({
      id: user.id,
      name: user.name,
      age: user.profile?.birthDate
        ? Math.floor((Date.now() - new Date(user.profile.birthDate).getTime()) / 31536000000)
        : null,
      distance: Math.floor(Math.random() * 49) + 1,
      compatibility: Math.floor(Math.random() * 21) + 75,
      photo: user.photos[0]?.url || '',
      photos: user.photos.map((p: { url: string }) => p.url),
      bio: user.profile?.bio || '',
      interests: user.profile?.interests || [],
      verified: user.verified ?? false,
      activeNow: false,
      isNew: false,
    }));
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    const ALLOWED = ['bio', 'birthDate', 'city', 'latitude', 'longitude', 'gender', 'lookingFor', 'goals', 'interests'];
    const profileData: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in data) profileData[key] = data[key];
    }
    return this.prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    });
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
          const match = await this.prisma.match.create({ data: { user1Id: u1, user2Id: u2 } });

          // Real-time socket notification
          this.gateway.server?.to(`user:${targetUserId}`).emit('match:new', { matchId: match.id, withUserId: userId });
          this.gateway.server?.to(`user:${userId}`).emit('match:new', { matchId: match.id, withUserId: targetUserId });

          // Push notification (fire-and-forget)
          const swiper = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          this.push.sendToUser(targetUserId, {
            title: "It's a Match! 💜",
            body: `You and ${swiper?.name || 'Someone'} liked each other!`,
            url: `/#/matches`,
            tag: `match-${match.id}`,
          }).catch(() => {});

          return { success: true, isMatch: true, matchId: match.id };
        }
        return { success: true, isMatch: true, matchId: existing.id };
      }
    }
    return { success: true, isMatch: false };
  }
}
