import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  private async verifyParticipant(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Not your match');
    }
    return match;
  }

  async getMessages(matchId: string, userId: string, limit = 50) {
    await this.verifyParticipant(matchId, userId);
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { messages: messages.reverse(), hasMore: messages.length === limit };
  }

  async create(matchId: string, senderId: string, content: string, type = 'TEXT') {
    await this.verifyParticipant(matchId, senderId);
    // Normalize to uppercase enum value
    const msgType = type.toUpperCase() as 'TEXT' | 'VOICE' | 'GIFT' | 'SYSTEM';
    return this.prisma.message.create({
      data: { matchId, senderId, content, type: msgType },
    });
  }
}
