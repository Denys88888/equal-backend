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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService, PaymentRecord } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CompletePaymentDto } from './dto/complete-payment.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role: string };
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payment' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiResponse({ status: 201, description: 'Payment created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
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
  @ApiOperation({ summary: 'Approve a pending payment' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Payment approved' })
  async approvePayment(@Param('paymentId') paymentId: string) {
    return this.paymentsService.approvePayment(paymentId);
  }

  @Post(':paymentId/complete')
  @ApiOperation({ summary: 'Complete a payment with transaction ID' })
  @ApiParam({ name: 'paymentId', description: 'Payment ID' })
  @ApiBody({ type: CompletePaymentDto })
  @ApiResponse({ status: 200, description: 'Payment completed' })
  async completePayment(
    @Param('paymentId') paymentId: string,
    @Body() dto: CompletePaymentDto,
  ) {
    return this.paymentsService.completePayment(paymentId, dto.txid);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved' })
  async getHistory(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ payments: PaymentRecord[] }> {
    const payments = await this.paymentsService.getHistory(req.user.userId);
    return { payments };
  }

  @Get('incomplete')
  @ApiOperation({ summary: 'Get incomplete payments' })
  @ApiResponse({ status: 200, description: 'Incomplete payments retrieved' })
  async getIncomplete(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ payments: PaymentRecord[] }> {
    const payments = this.paymentsService.findIncompletePayments(
      req.user.userId,
    );
    return { payments };
  }
}
