import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService, PaymentRecord } from './payments.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

class DoubleCheckPaymentDto {
  matchId: string;
  amount: number;
}

interface PaymentInitResponse {
  paymentId: string;
  status: string;
  deepLink: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('double-check')
  async initiateDoubleCheck(
    @Body() dto: DoubleCheckPaymentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaymentInitResponse> {
    return this.paymentsService.initiateDoubleCheck(
      req.user.userId,
      dto.matchId,
      dto.amount,
    );
  }

  @Post('webhook')
  async handleWebhook(
    @Body() payload: Record<string, unknown>,
  ): Promise<{ success: boolean; status: string }> {
    return this.paymentsService.handleWebhook(payload);
  }

  @Get('history')
  async getHistory(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ payments: PaymentRecord[] }> {
    const payments: PaymentRecord[] =
      await this.paymentsService.getHistory(req.user.userId);
    return { payments };
  }
}
