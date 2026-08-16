import {
  Body, Controller, Get, Param, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { BannedGuard } from '../common/banned.guard';
import { AskService } from './ask.service';
import { AnswerAskDto, CreateAskDto, ReportAskDto } from './ask.dto';

@ApiTags('Equal Ask')
@Controller('ask')
export class AskController {
  constructor(private readonly service: AskService) {}

  // ── My own Q&A (declared before :userId so they aren't shadowed) ──

  @Get('inbox')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async inbox(@Request() req: { user: { id: string } }) {
    return this.service.getInbox(req.user.id);
  }

  @Get('answered')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async answered(@Request() req: { user: { id: string } }) {
    return this.service.getAnswered(req.user.id);
  }

  @Get('sent')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async sent(@Request() req: { user: { id: string } }) {
    return this.service.getSent(req.user.id);
  }

  /**
   * Server-quoted price for a question. The client pays exactly this, and
   * create() re-derives it — the quote is a convenience, never the authority.
   */
  @Get(':userId/quote')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async quote(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
    @Query('anonymous') anonymous?: string,
    @Query('urgent') urgent?: string,
  ) {
    return this.service.quote(req.user.id, userId, {
      isAnonymous: anonymous === 'true',
      isUrgent: urgent === 'true',
    });
  }

  /**
   * Public Q&A feed. Deliberately readable signed-out so a shared /u/:username
   * link works for someone who doesn't have the app yet.
   */
  @Get(':userId')
  @UseGuards(OptionalJwtAuthGuard)
  async publicFeed(
    @Request() req: { user?: { id: string } },
    @Param('userId') userId: string,
    @Query('page') page?: string,
  ) {
    return this.service.getPublic(userId, parseInt(page || '1', 10), req.user?.id);
  }

  // ── Writes ────────────────────────────────────────────

  /** One question per 30s regardless of payment — throttles spam, not spend. */
  @Post(':userId')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 1, ttl: 30_000 } })
  async create(
    @Request() req: { user: { id: string } },
    @Param('userId') userId: string,
    @Body() body: CreateAskDto,
  ) {
    return this.service.create(req.user.id, userId, body);
  }

  @Post(':questionId/answer')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async answer(
    @Request() req: { user: { id: string } },
    @Param('questionId') questionId: string,
    @Body() body: AnswerAskDto,
  ) {
    return this.service.answer(req.user.id, questionId, body.answer);
  }

  @Post(':questionId/reject')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async reject(
    @Request() req: { user: { id: string } },
    @Param('questionId') questionId: string,
  ) {
    return this.service.reject(req.user.id, questionId);
  }

  @Post(':questionId/like')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async like(
    @Request() req: { user: { id: string } },
    @Param('questionId') questionId: string,
  ) {
    return this.service.like(req.user.id, questionId);
  }

  @Post(':questionId/report')
  @UseGuards(JwtAuthGuard, BannedGuard)
  @ApiBearerAuth()
  async report(
    @Request() req: { user: { id: string } },
    @Param('questionId') questionId: string,
    @Body() body: ReportAskDto,
  ) {
    return this.service.report(req.user.id, questionId, body.reason);
  }
}
