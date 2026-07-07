import { Controller, Post, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':paymentId/approve')
  async approve(@Param('paymentId') paymentId: string) {
    return this.paymentsService.approve(paymentId);
  }

  @Post(':paymentId/complete')
  async complete(@Param('paymentId') paymentId: string, @Body() body: { txid: string }) {
    return this.paymentsService.complete(paymentId, body.txid);
  }
}
