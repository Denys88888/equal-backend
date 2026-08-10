import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BannedGuard } from '../common/banned.guard';
import { VibeService } from './vibe.service';
import { SetVibeDto } from './daily-match.dto';

@ApiTags('Vibe Check')
@Controller('vibe')
@UseGuards(JwtAuthGuard, BannedGuard)
@ApiBearerAuth()
export class VibeController {
  constructor(private readonly vibes: VibeService) {}

  @Get()
  async getMine(@Request() req: { user: { id: string } }) {
    return this.vibes.getMyVibe(req.user.id);
  }

  @Post()
  async setMine(@Request() req: { user: { id: string } }, @Body() body: SetVibeDto) {
    return this.vibes.setVibe(req.user.id, body.vibe);
  }
}
