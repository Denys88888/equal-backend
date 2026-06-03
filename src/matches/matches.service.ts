import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async getMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { include: { profile: true, photos: true } },
        user2: { include: { profile: true, photos: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match: any) => {
      const partner = match.user1Id === userId ? match.user2 : match.user1;
      return {
        id: match.id,
        name: partner.name,
        photo: partner.photos[0]?.url || '',
        age: partner.profile?.birthDate ? Math.floor((Date.now() - new Date(partner.profile.birthDate).getTime()) / 31536000000) : 25,
        compatibility: Math.floor(Math.random() * 40) + 60,
      };
    });
  }

  async unmatch(matchId: string) {
    return this.prisma.match.delete({ where: { id: matchId } });
  }
}
