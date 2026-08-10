import {
  Body, Controller, Get, Param, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BannedGuard } from '../common/banned.guard';
import { DailyMatchService } from './daily-match.service';
import { SendDailyMessageDto, IcebreakerAnswerDto } from './daily-match.dto';

@ApiTags('Daily Match')
@Controller('daily-match')
@UseGuards(JwtAuthGuard, BannedGuard)
@ApiBearerAuth()
export class DailyMatchController {
  constructor(private readonly service: DailyMatchService) {}

  @Get()
  async getCurrent(@Request() req: { user: { id: string } }) {
    return this.service.getCurrent(req.user.id);
  }

  @Get(':id/messages')
  async getMessages(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Query('page') page?: string,
  ) {
    return this.service.getMessages(id, req.user.id, parseInt(page || '1', 10));
  }

  /** Rate limited to 1 message / 5s per the spec. */
  @Post(':id/message')
  @Throttle({ default: { limit: 1, ttl: 5000 } })
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: SendDailyMessageDto,
  ) {
    return this.service.sendMessage(id, req.user.id, body.content, body.kind ?? 'TEXT');
  }

  @Post(':id/skip')
  async skip(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.skip(id, req.user.id);
  }

  @Post(':id/view')
  async view(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.logView(id, req.user.id);
  }

  @Post(':id/icebreaker')
  async answerIcebreaker(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: IcebreakerAnswerDto,
  ) {
    return this.service.answerIcebreaker(id, req.user.id, body.answer);
  }

  @Post(':id/icebreaker/skip')
  async skipIcebreaker(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.skipIcebreaker(id, req.user.id);
  }

  /**
   * Called by the client only after the Pi payment has completed. The payment
   * itself goes through the existing /payments create → approve → complete flow.
   */
  @Post('extra')
  async extraMatch(@Request() req: { user: { id: string } }) {
    return this.service.createExtraMatch(req.user.id);
  }
}
