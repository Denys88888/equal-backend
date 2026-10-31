import { Body, Controller, Get, Delete, Param, Patch, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MatchesService } from './matches.service';

@ApiTags('Matches')
@Controller('matches')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async getMatches(@Request() req: { user: { id: string } }) {
    return this.matchesService.getMatches(req.user.id);
  }

  @Patch(':id/mute')
  async setMuted(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: { muted?: boolean },
  ) {
    return this.matchesService.setMuted(id, req.user.id, body?.muted !== false);
  }

  @Delete(':id')
  async unmatch(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.matchesService.unmatch(id, req.user.id);
  }
}
