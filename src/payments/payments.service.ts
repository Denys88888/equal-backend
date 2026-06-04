import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus } from '@prisma/client';

export interface PaymentRecord {
  identifier: string;
  user_id: string;
  amount: number;
  memo: string;
  metadata: { matchId: string };
  txid?: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
  created_at: string;
}

interface PiPaymentData {
  paymentId: string;
  status: string;
  txid?: string;
}

@Injectable()
export class PaymentsService {
  private readonly platformApiUrl = 'https://api.minepi.com/v2';

  constructor(private readonly prisma: PrismaService) {}

  private getApiKey(): string {
    const apiKey = process.env.PI_API_KEY;
    if (!apiKey) {
      throw new UnauthorizedException(
        'PI_API_KEY environment variable is not configured',
      );
    }
    return apiKey;
  }

  private async callPlatformApi(
    endpoint: string,
    body: unknown,
  ): Promise<unknown> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.platformApiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pi Platform API error: ${error}`);
    }
    return response.json();
  }

  private toRecord(p: {
    identifier: string;
    userId: string;
    amount: number;
    memo: string;
    matchId: string;
    txid: string | null;
    status: PaymentStatus;
    createdAt: Date;
  }): PaymentRecord {
    return {
      identifier: p.identifier,
      user_id: p.userId,
      amount: p.amount,
      memo: p.memo,
      metadata: { matchId: p.matchId },
      txid: p.txid ?? undefined,
      status: p.status.toLowerCase() as PaymentRecord['status'],
      created_at: p.createdAt.toISOString(),
    };
  }

  async createPayment(
    userId: string,
    amount: number,
    memo: string,
    matchId: string,
  ): Promise<PaymentRecord> {
    const identifier = `equal-payment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const payment = await this.prisma.payment.create({
      data: {
        identifier,
        userId,
        amount,
        memo,
        matchId,
        status: PaymentStatus.PENDING,
      },
    });
    return this.toRecord(payment);
  }

  async approvePayment(paymentId: string): Promise<{ approved: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { identifier: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    await this.callPlatformApi(`/payments/${paymentId}/approve`, {
      paymentId,
      developer_authorized: true,
    });

    await this.prisma.payment.update({
      where: { identifier: paymentId },
      data: { status: PaymentStatus.APPROVED },
    });

    return { approved: true };
  }

  async completePayment(
    paymentId: string,
    txid: string,
  ): Promise<{ completed: boolean }> {
    const payment = await this.prisma.payment.findUnique({
      where: { identifier: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    await this.callPlatformApi(`/payments/${paymentId}/complete`, {
      paymentId,
      txid,
      developer_authorized: true,
    });

    await this.prisma.payment.update({
      where: { identifier: paymentId },
      data: { status: PaymentStatus.COMPLETED, txid },
    });

    return { completed: true };
  }

  async getHistory(userId: string): Promise<PaymentRecord[]> {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map((p) => this.toRecord(p));
  }

  async findIncompletePayments(userId: string): Promise<PaymentRecord[]> {
    const payments = await this.prisma.payment.findMany({
      where: { userId, status: PaymentStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map((p) => this.toRecord(p));
  }
}
