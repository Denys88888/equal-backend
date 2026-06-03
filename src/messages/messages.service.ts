import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async getMessages(matchId: string, limit: number = 50) {
    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { messages: messages.reverse(), hasMore: messages.length === limit };
  }

  async create(matchId: string, senderId: string, content: string, type: string = 'text') {
    return this.prisma.message.create({
      data: { matchId, senderId, content, type },
    });
  }
}
