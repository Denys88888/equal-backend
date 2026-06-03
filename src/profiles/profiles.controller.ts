import { Controller, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfilesService } from './profiles.service';

@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('discover')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async discover(@Request() req: { user: { id: string } }, @Query() query: Record<string, string>) {
    return this.profilesService.discover(req.user.id, query);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyProfile(@Request() req: { user: { id: string } }) {
    return this.profilesService.getProfile(req.user.id);
  }
}
