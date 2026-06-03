import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('approve')
  async approve(@Body() body: { paymentId: string }) {
    return this.paymentsService.approve(body.paymentId);
  }

  @Post('complete')
  async complete(@Body() body: { paymentId: string; txid: string }) {
    return this.paymentsService.complete(body.paymentId, body.txid);
  }
}
