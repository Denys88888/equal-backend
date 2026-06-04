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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { MessagesService, PaginatedMessages } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Message, MessageType } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

class SendMessageDto {
  content!: string;
  type?: MessageType;
}

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('matches/:matchId/messages')
  @ApiOperation({ summary: 'Get messages for a match' })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedMessages> {
    const userId: string = req.user.userId;
    const pageNum: number = pagination.page ?? 1;
    const limitNum: number = pagination.limit ?? 20;

    return this.messagesService.findMessages(matchId, userId, pageNum, limitNum);
  }

  @Post('matches/:matchId/messages')
  @ApiOperation({ summary: 'Send a message' })
  @ApiParam({ name: 'matchId', description: 'Match ID' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('matchId') matchId: string,
    @Body() dto: SendMessageDto,
  ): Promise<Message> {
    const senderId: string = req.user.userId;
    const type: MessageType = dto.type ?? MessageType.TEXT;

    return this.messagesService.createMessage(matchId, senderId, dto.content, type);
  }

  @Patch('messages/:messageId/read')
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiParam({ name: 'messageId', description: 'Message ID' })
  @ApiResponse({ status: 200, description: 'Message marked as read' })
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Param('messageId') messageId: string,
  ): Promise<Message> {
    const userId: string = req.user.userId;
    return this.messagesService.markAsRead(messageId, userId);
  }
}
