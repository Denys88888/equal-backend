import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  private readonly payments: Map<string, PaymentRecord> = new Map();
  private readonly platformApiUrl = 'https://api.minepi.com/v2';

  constructor(private readonly prisma: PrismaService) {}

  private getApiKey(): string {
    return process.env.PI_API_KEY || '';
  }

  private async callPlatformApi(
    endpoint: string,
    body: unknown,
  ): Promise<unknown> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      // In development without API key, mock the response
      return { approved: true };
    }
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

  createPayment(
    userId: string,
    amount: number,
    memo: string,
    matchId: string,
  ): PaymentRecord {
    const identifier = `equal-payment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const payment: PaymentRecord = {
      identifier,
      user_id: userId,
      amount,
      memo,
      metadata: { matchId },
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    this.payments.set(identifier, payment);
    return payment;
  }

  async approvePayment(paymentId: string): Promise<{ approved: boolean }> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');

    await this.callPlatformApi(`/payments/${paymentId}/approve`, {
      paymentId,
    });
    payment.status = 'approved';
    this.payments.set(paymentId, payment);
    return { approved: true };
  }

  async completePayment(
    paymentId: string,
    txid: string,
  ): Promise<{ completed: boolean }> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new NotFoundException('Payment not found');

    await this.callPlatformApi(`/payments/${paymentId}/complete`, {
      paymentId,
      txid,
    });
    payment.status = 'completed';
    payment.txid = txid;
    this.payments.set(paymentId, payment);
    return { completed: true };
  }

  getHistory(userId: string): PaymentRecord[] {
    const userPayments: PaymentRecord[] = [];
    for (const payment of this.payments.values()) {
      if (payment.user_id === userId) {
        userPayments.push(payment);
      }
    }
    return userPayments.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  findIncompletePayments(userId: string): PaymentRecord[] {
    const incomplete: PaymentRecord[] = [];
    for (const payment of this.payments.values()) {
      if (payment.user_id === userId && payment.status === 'pending') {
        incomplete.push(payment);
      }
    }
    return incomplete;
  }
}
