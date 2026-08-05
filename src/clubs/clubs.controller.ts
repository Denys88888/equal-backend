import { Controller, Get, Post, Delete, Body, UseGuards, Request, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { UploadService } from '../upload/upload.service';

@ApiTags('Clubs')
@Controller('clubs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClubsController {
  constructor(
    private readonly clubsService: ClubsService,
    private readonly uploadService: UploadService,
  ) {}

  @Get()
  async getClubs(@Request() req: { user: { id: string } }) {
    // Pass the caller so isJoined reflects reality instead of always being false
    return this.clubsService.getAll(req.user.id);
  }

  @Get(':id')
  async getClub(@Param('id') clubId: string) {
    return this.clubsService.getOne(clubId);
  }

  @Post()
  async createClub(@Body() body: { name: string; description?: string; category: string }) {
    return this.clubsService.create(body);
  }

  @Post(':id/join')
  async joinClub(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.join(clubId, req.user.id);
  }

  @Post(':id/leave')
  async leaveClub(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.leave(clubId, req.user.id);
  }

  // Declared before ':id/posts' etc. so 'members' isn't swallowed as an :id param
  @Get(':id/members')
  async getMembers(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.getMembers(clubId, req.user.id);
  }

  @Get(':id/posts')
  async getPosts(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.getPosts(clubId, req.user.id);
  }

  @Post(':id/posts')
  @UseInterceptors(FileInterceptor('image', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
  }))
  async createPost(
    @Request() req: { user: { id: string } },
    @Param('id') clubId: string,
    @Body() body: { content: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl: string | undefined;
    if (file) {
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException('File must be an image');
      }
      imageUrl = await this.uploadService.uploadPhoto(file, req.user.id);
    }
    return this.clubsService.createPost(clubId, req.user.id, body.content, imageUrl);
  }

  @Delete('posts/:postId')
  async deletePost(
    @Request() req: { user: { id: string; role?: string } },
    @Param('postId') postId: string,
  ) {
    return this.clubsService.deletePost(postId, req.user.id, req.user.role === 'ADMIN');
  }

  @Delete('comments/:commentId')
  async deleteComment(
    @Request() req: { user: { id: string; role?: string } },
    @Param('commentId') commentId: string,
  ) {
    return this.clubsService.deleteComment(commentId, req.user.id, req.user.role === 'ADMIN');
  }

  @Post('posts/:postId/like')
  async toggleLike(
    @Request() req: { user: { id: string } },
    @Param('postId') postId: string,
  ) {
    return this.clubsService.toggleLike(postId, req.user.id);
  }

  @Get('posts/:postId/comments')
  async getComments(
    @Request() req: { user: { id: string } },
    @Param('postId') postId: string,
  ) {
    return this.clubsService.getComments(postId, req.user.id);
  }

  @Post('posts/:postId/comments')
  async createComment(
    @Request() req: { user: { id: string } },
    @Param('postId') postId: string,
    @Body() body: { content: string },
  ) {
    return this.clubsService.createComment(postId, req.user.id, body.content);
  }

  @Get(':id/messages')
  async getMessages(
    @Request() req: { user: { id: string } },
    @Param('id') clubId: string,
    @Query('limit') limit?: string,
  ) {
    return this.clubsService.getMessages(clubId, req.user.id, parseInt(limit || '50'));
  }

  @Post(':id/messages')
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param('id') clubId: string,
    @Body() body: { content: string },
  ) {
    return this.clubsService.createMessage(clubId, req.user.id, body.content);
  }
}
