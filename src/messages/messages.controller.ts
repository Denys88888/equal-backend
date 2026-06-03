import { Controller, Get, Post, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@ApiTags('Messages')
@Controller('matches/:matchId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMessages(@Param('matchId') matchId: string, @Query('limit') limit?: string) {
    return this.messagesService.getMessages(matchId, parseInt(limit || '50'));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param('matchId') matchId: string,
    @Body() body: { content: string; type?: string },
  ) {
    return this.messagesService.create(matchId, req.user.id, body.content, body.type || 'text');
  }
}
