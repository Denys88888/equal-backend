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
      include: { profile: true, photos: true },
    });

    return profiles.map((user: any) => ({
      id: user.id,
      name: user.name,
      age: user.profile?.birthDate ? Math.floor((Date.now() - new Date(user.profile.birthDate).getTime()) / 31536000000) : 25,
      distance: Math.floor(Math.random() * 20) + 1,
      compatibility: Math.floor(Math.random() * 40) + 60,
      photo: user.photos[0]?.url || '',
      bio: user.profile?.bio || '',
      interests: user.profile?.interests || [],
      verified: user.verified,
    }));
  }
}
