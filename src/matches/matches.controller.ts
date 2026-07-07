import { Controller, Get, Delete, Param, UseGuards, Request } from '@nestjs/common';
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

  @Delete(':id')
  async unmatch(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.matchesService.unmatch(id, req.user.id);
  }
}
