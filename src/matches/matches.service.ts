import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchesService {
  constructor(private prisma: PrismaService) {}

  async getMatches(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
      include: {
        user1: { include: { profile: true, photos: { orderBy: { order: 'asc' }, take: 1 } } },
        user2: { include: { profile: true, photos: { orderBy: { order: 'asc' }, take: 1 } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const partner = match.user1Id === userId ? match.user2 : match.user1;
      const birthDate = partner.profile?.birthDate;
      const age = birthDate
        ? Math.floor((Date.now() - new Date(birthDate).getTime()) / 31536000000)
        : null;
      const ageMs = Date.now() - new Date(match.createdAt).getTime();
      const lastMsg = match.messages[0];
      return {
        id: match.id,
        name: partner.name,
        photo: partner.photos[0]?.url || '',
        age,
        compatibility: 80,
        createdAt: match.createdAt,
        isNew: ageMs < 24 * 60 * 60 * 1000,
        hasConversation: match.messages.length > 0,
        isOnline: false,
        sparkUsed: false,
        unreadCount: 0,
        lastMessage: lastMsg?.content,
        lastMessageTime: lastMsg?.createdAt,
        isTyping: false,
      };
    });
  }

  async unmatch(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Not your match');
    }
    return this.prisma.match.delete({ where: { id: matchId } });
  }
}
