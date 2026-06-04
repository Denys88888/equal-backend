import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { MessagesService, PaginatedMessages } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Message, MessageType } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

interface SendMessageBody {
  content: string;
  type?: MessageType;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('matches/:matchId/messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedMessages> {
    const userId: string = req.user.userId;
    const pageNum: number = page ? parseInt(page, 10) : 1;
    const limitNum: number = limit ? parseInt(limit, 10) : 20;

    return this.messagesService.findMessages(matchId, userId, pageNum, limitNum);
  }

  @Post('matches/:matchId/messages')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Body() body: SendMessageBody,
  ): Promise<Message> {
    const senderId: string = req.user.userId;
    const type: MessageType = body.type ?? MessageType.TEXT;

    return this.messagesService.createMessage(matchId, senderId, body.content, type);
  }

  @Patch('messages/:messageId/read')
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ): Promise<Message> {
    const userId: string = req.user.userId;
    return this.messagesService.markAsRead(messageId, userId);
  }
}
