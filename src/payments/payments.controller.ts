import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService, PaymentRecord } from './payments.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string };
}

class CreatePaymentDto {
  amount!: number;
  memo!: string;
  matchId!: string;
}

class CompletePaymentDto {
  txid!: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaymentRecord> {
    return this.paymentsService.createPayment(
      req.user.userId,
      dto.amount,
      dto.memo,
      dto.matchId,
    );
  }

  @Post(':paymentId/approve')
  async approvePayment(@Param('paymentId') paymentId: string) {
    return this.paymentsService.approvePayment(paymentId);
  }

  @Post(':paymentId/complete')
  async completePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: CompletePaymentDto,
  ) {
    return this.paymentsService.completePayment(paymentId, dto.txid);
  }

  @Get('history')
  async getHistory(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ payments: PaymentRecord[] }> {
    const payments = await this.paymentsService.getHistory(req.user.userId);
    return { payments };
  }

  @Get('incomplete')
  async getIncomplete(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ payments: PaymentRecord[] }> {
    const payments = this.paymentsService.findIncompletePayments(
      req.user.userId,
    );
    return { payments };
  }
}
