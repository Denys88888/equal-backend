import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getHistory(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getHistory(req.user.id);
  }

  @Get('incomplete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getIncomplete(@Request() req: { user: { id: string } }) {
    return this.paymentsService.getIncomplete(req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createPayment(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; memo: string; matchId?: string; eventId?: string },
  ) {
    return this.paymentsService.create(req.user.id, body.amount, body.memo, body.matchId, body.eventId);
  }

  @Post(':paymentId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async approve(@Request() req: { user: { id: string } }, @Param('paymentId') paymentId: string) {
    return this.paymentsService.approve(req.user.id, paymentId);
  }

  @Post(':paymentId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async complete(
    @Request() req: { user: { id: string } },
    @Param('paymentId') paymentId: string,
    @Body() body: { txid: string },
  ) {
    return this.paymentsService.complete(req.user.id, paymentId, body.txid);
  }
}
