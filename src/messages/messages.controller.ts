import { Controller, Get, Post, Body, UseGuards, Request, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { UploadService } from '../upload/upload.service';

@ApiTags('Messages')
@Controller('matches/:matchId/messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  async getMessages(
    @Request() req: { user: { id: string } },
    @Param('matchId') matchId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMessages(matchId, req.user.id, parseInt(limit || '50'));
  }

  @Post()
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param('matchId') matchId: string,
    @Body() body: { content: string; type?: string; giftType?: string },
  ) {
    return this.messagesService.create(matchId, req.user.id, body.content, body.type, body.giftType);
  }

  @Post('voice')
  @UseInterceptors(FileInterceptor('audio', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  async sendVoice(
    @Request() req: { user: { id: string } },
    @Param('matchId') matchId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No audio file provided');
    if (!file.mimetype?.startsWith('audio/')) {
      throw new BadRequestException('File must be audio');
    }
    const url = await this.uploadService.uploadAudio(file, req.user.id);
    return this.messagesService.create(matchId, req.user.id, url, 'VOICE');
  }
}
