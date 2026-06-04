import { Controller, Get, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { MatchesService, MatchWithOtherUser, MatchDetailDto } from './matches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  async listMatches(@Req() req: AuthenticatedRequest): Promise<MatchWithOtherUser[]> {
    const userId: string = req.user.userId;
    return this.matchesService.findMatches(userId);
  }

  @Get(':id')
  async getMatch(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ): Promise<MatchDetailDto> {
    const userId: string = req.user.userId;
    return this.matchesService.findMatchById(matchId, userId);
  }

  @Delete(':id')
  async unmatch(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ): Promise<{ deleted: boolean }> {
    const userId: string = req.user.userId;
    return this.matchesService.deleteMatch(matchId, userId);
  }
}
