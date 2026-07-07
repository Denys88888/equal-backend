import { Controller, Get, Patch, Post, Delete, Body, Query, UseGuards, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@Request() req: { user: { id: string } }) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  async updateMe(@Request() req: { user: { id: string } }, @Body() body: Record<string, unknown>) {
    return this.usersService.update(req.user.id, body);
  }

  @Post('me/photos')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body('isMain') isMain: string,
  ) {
    // Store file path (in production use S3/Cloudinary URL)
    const url = file ? `/uploads/${file.filename || file.originalname}` : '';
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
}
