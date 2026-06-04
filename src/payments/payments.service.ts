import { Injectable } from '@nestjs/common';

export interface PaymentRecord {
  id: string;
  userId: string;
  matchId: string;
  amount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  type: 'DOUBLE_CHECK';
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentInitResponse {
  paymentId: string;
  status: string;
  deepLink: string;
}

interface WebhookResponse {
  success: boolean;
  status: string;
}

@Injectable()
export class PaymentsService {
  private readonly payments: Map<string, PaymentRecord> = new Map();

  initiateDoubleCheck(
    userId: string,
    matchId: string,
    amount: number,
  ): PaymentInitResponse {
    const paymentId: string = `pi-payment-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const payment: PaymentRecord = {
      id: paymentId,
      userId,
      matchId,
      amount,
      status: 'PENDING',
      type: 'DOUBLE_CHECK',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.set(paymentId, payment);

    const deepLink: string = `pi://payment?amount=${amount}&memo=DoubleCheck_${matchId}&paymentId=${paymentId}`;

    return {
      paymentId,
      status: 'PENDING',
      deepLink,
    };
  }

  handleWebhook(payload: Record<string, unknown>): WebhookResponse {
    const paymentId: string | undefined =
      typeof payload.paymentId === 'string' ? payload.paymentId : undefined;

    if (paymentId && this.payments.has(paymentId)) {
      const payment = this.payments.get(paymentId)!;
      payment.status = 'COMPLETED';
      payment.updatedAt = new Date();
      this.payments.set(paymentId, payment);
    }

    return {
      success: true,
      status: 'PROCESSED',
    };
  }

  getHistory(userId: string): PaymentRecord[] {
    const userPayments: PaymentRecord[] = [];
    for (const payment of this.payments.values()) {
      if (payment.userId === userId) {
        userPayments.push(payment);
      }
    }
    return userPayments.sort(
      (a: PaymentRecord, b: PaymentRecord) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
}
