import { Controller, Get, Patch, Post, Delete, Body, Query, Param, UseGuards, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('me')
  async getMe(@Request() req: { user: { id: string } }) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  async updateMe(@Request() req: { user: { id: string } }, @Body() body: Record<string, unknown>) {
    return this.usersService.update(req.user.id, body);
  }

  @Post('me/photos')
  @UseInterceptors(FileInterceptor('photo', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
    fileFilter: (_req, file, cb) => {
      cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
    },
  }))
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

  @Post(':id/block')
  async blockUser(
    @Request() req: { user: { id: string } },
    @Param('id') targetId: string,
  ) {
    return this.usersService.blockUser(req.user.id, targetId);
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
