import { Controller, Get, Post, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';

@ApiTags('Clubs')
@Controller('clubs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

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

  @Get(':id/posts')
  async getPosts(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.getPosts(clubId, req.user.id);
  }

  @Post(':id/posts')
  async createPost(
    @Request() req: { user: { id: string } },
    @Param('id') clubId: string,
    @Body() body: { content: string },
  ) {
    return this.clubsService.createPost(clubId, req.user.id, body.content);
  }

  @Post('posts/:postId/like')
  async toggleLike(
    @Request() req: { user: { id: string } },
    @Param('postId') postId: string,
  ) {
    return this.clubsService.toggleLike(postId, req.user.id);
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
