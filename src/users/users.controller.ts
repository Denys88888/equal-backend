import { Controller, Get, Patch, Post, Delete, Body, Query, Param, UseGuards, Request, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';
import { PushService } from './push.service';
import { UpdateSettingsDto } from './users.dto';
import { isAudioUpload, recordAudioUpload } from '../common/audio-upload';

/** The app records 15 s; the margin covers a picked file or a slow stop. */
const MAX_VIDEO_SECONDS = 30;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024;

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

  /** Badges earned from real activity (Profile → Badges). */
  @Get('me/achievements')
  async getAchievements(@Request() req: { user: { id: string } }) {
    return this.usersService.getAchievements(req.user.id);
  }

  /** Settings → Privacy / Notifications toggles. */
  @Patch('me/settings')
  async updateSettings(@Request() req: { user: { id: string } }, @Body() body: UpdateSettingsDto) {
    return this.usersService.updateSettings(req.user.id, body);
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
    if (!isAudioUpload(file)) {
      recordAudioUpload('voice-intro', file, 'rejected');
      throw new BadRequestException(file ? 'File must be audio' : 'No audio uploaded');
    }
    let url: string;
    try {
      url = await this.uploadService.uploadAudio(file, req.user.id);
    } catch (err) {
      recordAudioUpload('voice-intro', file, 'storage_error', String((err as Error)?.message ?? err));
      throw err;
    }
    recordAudioUpload('voice-intro', file, 'ok');
    return this.usersService.setVoiceIntro(req.user.id, url);
  }

  @Delete('me/voice-intro')
  async deleteVoiceIntro(@Request() req: { user: { id: string } }) {
    return this.usersService.deleteVoiceIntro(req.user.id);
  }

  /**
   * Video intro — up to 15 s, recorded in the app (Onboarding, Profile) and
   * shown on the profile. The onboarding button used to keep the clip on the
   * phone only: nothing was uploaded and no screen ever showed it.
   */
  @Post('me/video-intro')
  @UseInterceptors(FileInterceptor('video', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_VIDEO_BYTES },
  }))
  async uploadVideoIntro(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.size || !/^video\//i.test(file.mimetype || '')) {
      throw new BadRequestException(file ? 'File must be a video' : 'No video uploaded');
    }
    const { url, duration, publicId } = await this.uploadService.uploadVideo(file, req.user.id);
    if (duration !== null && duration > MAX_VIDEO_SECONDS) {
      await this.uploadService.deleteVideo(publicId);
      throw new BadRequestException(`Video intro must be ${MAX_VIDEO_SECONDS} seconds or shorter`);
    }
    return this.usersService.setVideoIntro(req.user.id, url);
  }

  @Delete('me/video-intro')
  async deleteVideoIntro(@Request() req: { user: { id: string } }) {
    return this.usersService.deleteVideoIntro(req.user.id);
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
  @UseInterceptors(FileInterceptor('photo', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
  }))
  async uploadPhoto(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body('isMain') isMain: string,
  ) {
    // fileFilter rejects by dropping the file, so a wrong type arrives as no
    // file at all — without this it would be stored as an empty-url photo row.
    if (!file) throw new BadRequestException('Photo must be a JPEG, PNG, WebP or GIF under 8 MB');
    const url = await this.uploadService.uploadPhoto(file, req.user.id);
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
