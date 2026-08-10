import { Controller, Get, Patch, Post, Delete, Body, Query, Param, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';
import { PushService } from './push.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
    private readonly pushService: PushService,
  ) {}

  @Get('me')
  async getMe(@Request() req: { user: { id: string } }) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  async updateMe(@Request() req: { user: { id: string } }, @Body() body: Record<string, unknown>) {
    return this.usersService.update(req.user.id, body);
  }

  @Post('me/push-subscription')
  async savePushSubscription(@Request() req: { user: { id: string } }, @Body() body: object) {
    await this.pushService.saveSubscription(req.user.id, body);
    return { ok: true };
  }

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { key: process.env.VAPID_PUBLIC_KEY || '' };
  }

  /**
   * Voice Intro — a ~10s audio/webm clip recorded client-side. Required before
   * a profile is eligible for Daily Match.
   */
  @Post('me/voice-intro')
  @UseInterceptors(FileInterceptor('voice', {
    storage: memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
  }))
  async uploadVoiceIntro(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No audio uploaded');
    if (!file.mimetype?.startsWith('audio/')) {
      throw new BadRequestException('File must be audio');
    }
    const url = await this.uploadService.uploadAudio(file, req.user.id);
    return this.usersService.setVoiceIntro(req.user.id, url);
  }

  @Delete('me/voice-intro')
  async deleteVoiceIntro(@Request() req: { user: { id: string } }) {
    return this.usersService.deleteVoiceIntro(req.user.id);
  }

  /** Daily Match delivery preferences (timezone, local delivery time, languages). */
  @Patch('me/match-prefs')
  async updateMatchPrefs(
    @Request() req: { user: { id: string } },
    @Body() body: { timezone?: string; dailyMatchTime?: string; languages?: string[] },
  ) {
    return this.usersService.updateMatchPrefs(req.user.id, body);
  }

  @Post('me/photos')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  async uploadPhoto(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body('isMain') isMain: string,
  ) {
    const url = file ? await this.uploadService.uploadPhoto(file, req.user.id) : '';
    return this.usersService.addPhoto(req.user.id, url, isMain === 'true');
  }

  @Delete('me/photos')
  async deletePhoto(@Request() req: { user: { id: string } }, @Query('photoId') photoId: string) {
    return this.usersService.deletePhoto(req.user.id, photoId);
  }

  @Post('me/photos/reorder')
  async reorderPhotos(
    @Request() req: { user: { id: string } },
    @Body() body: { photoIds: string[] },
  ) {
    return this.usersService.reorderPhotos(req.user.id, body.photoIds);
  }

  @Delete('me')
  async deleteMe(@Request() req: { user: { id: string } }) {
    return this.usersService.deleteUser(req.user.id);
  }

  // Declared before ':id/block' so "blocked" isn't swallowed as an :id param
  @Get('me/blocked')
  async getBlocked(@Request() req: { user: { id: string } }) {
    return this.usersService.getBlockedUsers(req.user.id);
  }

  @Post(':id/block')
  async blockUser(
    @Request() req: { user: { id: string } },
    @Param('id') targetId: string,
  ) {
    return this.usersService.blockUser(req.user.id, targetId);
  }

  @Delete(':id/block')
  async unblockUser(
    @Request() req: { user: { id: string } },
    @Param('id') targetId: string,
  ) {
    return this.usersService.unblockUser(req.user.id, targetId);
  }

  @Post(':id/report')
  async reportUser(
    @Request() req: { user: { id: string } },
    @Param('id') targetId: string,
    @Body() body: { reason: string; description?: string },
  ) {
    return this.usersService.reportUser(req.user.id, targetId, body.reason, body.description);
  }
}
