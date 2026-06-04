import { Controller, Get, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { MatchesService, MatchWithOtherUser, MatchDetailDto } from './matches.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

@ApiTags('Matches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: 'List all matches for current user' })
  @ApiResponse({ status: 200, description: 'Matches retrieved successfully' })
  async listMatches(@Req() req: AuthenticatedRequest): Promise<MatchWithOtherUser[]> {
    const userId: string = req.user.userId;
    return this.matchesService.findMatches(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get match details by ID' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match details retrieved' })
  @ApiResponse({ status: 404, description: 'Match not found' })
  async getMatch(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ): Promise<MatchDetailDto> {
    const userId: string = req.user.userId;
    return this.matchesService.findMatchById(matchId, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unmatch (delete a match)' })
  @ApiParam({ name: 'id', description: 'Match ID' })
  @ApiResponse({ status: 200, description: 'Match deleted successfully' })
  async unmatch(
    @Req() req: AuthenticatedRequest,
    @Param('id') matchId: string,
  ): Promise<{ deleted: boolean }> {
    const userId: string = req.user.userId;
    return this.matchesService.deleteMatch(matchId, userId);
  }
}
