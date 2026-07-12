import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../users/push.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  private async verifyParticipant(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Not your match');
    }
    return match;
  }

  async getMessages(matchId: string, userId: string, limit = 50) {
    const match = await this.verifyParticipant(matchId, userId);
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      include: { photos: { orderBy: { order: 'asc' }, take: 1 } },
    });
    const normalized = messages.reverse().map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      sender: m.senderId === userId ? 'me' : 'them',
      timestamp: m.createdAt,
      read: true,
    }));
    return {
      messages: normalized,
      hasMore: messages.length === limit,
      partnerId,
      matchName: partner?.name || '',
      matchAvatar: partner?.photos[0]?.url || '',
      isOnline: false,
      isVerified: false,
      sharedInterests: [],
      icebreakers: [],
    };
  }

  async create(matchId: string, senderId: string, content: string, type = 'TEXT') {
    const match = await this.verifyParticipant(matchId, senderId);
    const msgType = type.toUpperCase() as 'TEXT' | 'VOICE' | 'GIFT' | 'SYSTEM';
    const message = await this.prisma.message.create({
      data: { matchId, senderId, content, type: msgType },
    });

    // Push notification to the other participant
    const recipientId = match.user1Id === senderId ? match.user2Id : match.user1Id;
    const sender = await this.prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
    this.push.sendToUser(recipientId, {
      title: `New message from ${sender?.name || 'Someone'}`,
      body: content.length > 80 ? content.slice(0, 80) + '…' : content,
      url: `/#/chat/${matchId}`,
      tag: `msg-${matchId}`,
    }).catch(() => {});

    return message;
  }
}
