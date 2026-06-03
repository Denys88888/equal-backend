import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';

@ApiTags('Clubs')
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getClubs() {
    return this.clubsService.getAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createClub(@Body() body: { name: string; description?: string; category: string }) {
    return this.clubsService.create(body);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async joinClub(@Request() req: { user: { id: string } }, @Param('id') clubId: string) {
    return this.clubsService.join(clubId, req.user.id);
  }

  @Get(':id/posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getPosts(@Param('id') clubId: string) {
    return this.clubsService.getPosts(clubId);
  }

  @Post(':id/posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createPost(
    @Request() req: { user: { id: string } },
    @Param('id') clubId: string,
    @Body() body: { content: string },
  ) {
    return this.clubsService.createPost(clubId, req.user.id, body.content);
  }
}
