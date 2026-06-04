import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageType } from '@prisma/client';

interface JoinMatchPayload {
  matchId: string;
}

interface SendMessagePayload {
  matchId: string;
  senderId: string;
  content: string;
  type?: MessageType;
}

interface TypingPayload {
  matchId: string;
  senderId: string;
  isTyping: boolean;
}

interface ChatMessageResponse {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  type: MessageType;
  createdAt: Date;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger: Logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinMatch')
  handleJoinMatch(
    @MessageBody() payload: JoinMatchPayload,
    @ConnectedSocket() client: Socket,
  ): { success: boolean; matchId: string } {
    const { matchId }: JoinMatchPayload = payload;
    void client.join(`match_${matchId}`);
    this.logger.log(`Client ${client.id} joined room match_${matchId}`);

    return { success: true, matchId };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: SendMessagePayload,
  ): Promise<ChatMessageResponse> {
    const { matchId, senderId, content, type }: SendMessagePayload = payload;

    // Validate that senderId is part of the match
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { user1Id: true, user2Id: true },
    });

    if (!match || (match.user1Id !== senderId && match.user2Id !== senderId)) {
      throw new Error('Sender is not a participant in this match');
    }

    const messageType: MessageType = type ?? MessageType.TEXT;

    const savedMessage: {
      id: string;
      matchId: string;
      senderId: string;
      content: string;
      type: MessageType;
      createdAt: Date;
    } = await this.prisma.message.create({
      data: {
        matchId,
        senderId,
        content,
        type: messageType,
      },
      select: {
        id: true,
        matchId: true,
        senderId: true,
        content: true,
        type: true,
        createdAt: true,
      },
    });

    this.server
      .to(`match_${matchId}`)
      .emit('newMessage', savedMessage);

    return savedMessage;
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: TypingPayload,
  ): { success: boolean; matchId: string } {
    const { matchId, senderId, isTyping }: TypingPayload = payload;

    this.server
      .to(`match_${matchId}`)
      .emit('typing', { matchId, senderId, isTyping });

    return { success: true, matchId };
  }
}
