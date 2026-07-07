import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfilesService } from './profiles.service';

@ApiTags('Profiles')
@Controller('profiles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('discover')
  async discover(@Request() req: { user: { id: string } }, @Query() query: Record<string, string>) {
    return this.profilesService.discover(req.user.id, query);
  }

  @Get('me')
  async getMyProfile(@Request() req: { user: { id: string } }) {
    return this.profilesService.getProfile(req.user.id);
  }

  @Post('swipe')
  async swipe(
    @Request() req: { user: { id: string } },
    @Body() body: { targetUserId: string; action: 'like' | 'dislike' | 'spark' },
  ) {
    return this.profilesService.swipe(req.user.id, body.targetUserId, body.action);
  }
}
