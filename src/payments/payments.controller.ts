import { Controller, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async createPayment(
    @Request() req: { user: { id: string } },
    @Body() body: { amount: number; memo: string; matchId?: string },
  ) {
    return this.paymentsService.create(req.user.id, body.amount, body.memo, body.matchId);
  }

  @Post(':paymentId/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async approve(@Param('paymentId') paymentId: string) {
    return this.paymentsService.approve(paymentId);
  }

  @Post(':paymentId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async complete(@Param('paymentId') paymentId: string, @Body() body: { txid: string }) {
    return this.paymentsService.complete(paymentId, body.txid);
  }
}
