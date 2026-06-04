import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Message, MessageType } from '@prisma/client';

export interface PaginatedMessages {
  messages: Message[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateMessageDto {
  content: string;
  type?: MessageType;
}

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMessages(
    matchId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedMessages> {
    // Verify user is part of this match
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('You are not part of this match');
    }

    const skip: number = (page - 1) * limit;

    const [messages, total]: [Message[], number] = await Promise.all([
      this.prisma.message.findMany({
        where: { matchId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({
        where: { matchId },
      }),
    ]);

    return {
      messages,
      total,
      page,
      limit,
    };
  }

  async createMessage(
    matchId: string,
    senderId: string,
    content: string,
    type: MessageType = MessageType.TEXT,
  ): Promise<Message> {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Message content cannot be empty');
    }

    // Verify sender is part of this match
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.user1Id !== senderId && match.user2Id !== senderId) {
      throw new ForbiddenException('You are not part of this match');
    }

    const message: Message = await this.prisma.message.create({
      data: {
        matchId,
        senderId,
        content: content.trim(),
        type,
      },
    });

    return message;
  }

  async markAsRead(messageId: string, userId: string): Promise<Message> {
    const message: Message | null = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Verify user is part of the match this message belongs to
    const match = await this.prisma.match.findUnique({
      where: { id: message.matchId },
      select: { user1Id: true, user2Id: true },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('You are not part of this match');
    }

    // Only the recipient (not the sender) can mark as read
    if (message.senderId === userId) {
      throw new ForbiddenException('You cannot mark your own message as read');
    }

    const updatedMessage: Message = await this.prisma.message.update({
      where: { id: messageId },
      data: { read: true },
    });

    return updatedMessage;
  }
}
