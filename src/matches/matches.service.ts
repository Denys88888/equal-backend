import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';

@Injectable()
export class MatchesService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
  ) {}

  async getMatches(userId: string) {
    const [matches, myProfile] = await Promise.all([
      this.prisma.match.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        include: {
          user1: { include: { profile: true, photos: { orderBy: { order: 'asc' }, take: 1 } } },
          user2: { include: { profile: true, photos: { orderBy: { order: 'asc' }, take: 1 } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.profile.findUnique({ where: { userId }, select: { interests: true } }),
    ]);

    const myInterests = new Set(myProfile?.interests ?? []);
    const matchIds = matches.map((m) => m.id);

    // Single query for all unread counts (messages not sent by me, not yet read)
    const unreadRows = await this.prisma.message.groupBy({
      by: ['matchId'],
      where: { matchId: { in: matchIds }, senderId: { not: userId }, read: false },
      _count: { id: true },
    });
    const unreadMap = Object.fromEntries(unreadRows.map((r) => [r.matchId, r._count.id]));

    return matches.map((match) => {
      const partner = match.user1Id === userId ? match.user2 : match.user1;
      const birthDate = partner.profile?.birthDate;
      const age = birthDate
        ? Math.floor((Date.now() - new Date(birthDate).getTime()) / 31536000000)
        : null;
      const ageMs = Date.now() - new Date(match.createdAt).getTime();
      const lastMsg = match.messages[0];

      // Jaccard similarity on shared interests
      const theirInterests: string[] = partner.profile?.interests ?? [];
      const intersection = theirInterests.filter((i) => myInterests.has(i)).length;
      const union = new Set([...myInterests, ...theirInterests]).size;
      const compatibility = union > 0 ? Math.round((intersection / union) * 100) : 50;

      return {
        id: match.id,
        name: partner.name,
        photo: partner.photos[0]?.url || '',
        age,
        compatibility,
        createdAt: match.createdAt,
        isNew: ageMs < 24 * 60 * 60 * 1000,
        hasConversation: match.messages.length > 0,
        isOnline: this.gateway.isOnline(partner.id),
        sparkUsed: false,
        unreadCount: unreadMap[match.id] ?? 0,
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
