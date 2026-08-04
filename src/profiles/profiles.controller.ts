import { Controller, Get, Post, Put, Patch, Body, UseGuards, Request, Query, Param } from '@nestjs/common';
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

  @Put('me')
  async updateMyProfile(
    @Request() req: { user: { id: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.profilesService.updateProfile(req.user.id, body);
  }

  @Patch('me')
  async patchMyProfile(
    @Request() req: { user: { id: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.profilesService.updateProfile(req.user.id, body);
  }

  @Post('swipe')
  async swipe(
    @Request() req: { user: { id: string } },
    @Body() body: { targetUserId: string; action: 'like' | 'dislike' | 'spark' },
  ) {
    return this.profilesService.swipe(req.user.id, body.targetUserId, body.action);
  }

  @Post('swipe/undo')
  async undoSwipe(@Request() req: { user: { id: string } }) {
    return this.profilesService.undoLastSwipe(req.user.id);
  }

  // Declared last so it never swallows the static routes above ('discover',
  // 'me', 'swipe') as a :userId value.
  @Get(':userId')
  async getPublicProfile(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
  ) {
    return this.profilesService.getPublicProfile(req.user.id, userId);
  }
}
