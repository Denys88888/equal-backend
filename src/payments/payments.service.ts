import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PI_API_BASE = 'https://api.minepi.com/v2';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  private get apiKey(): string {
    const key = process.env.PI_API_KEY;
    if (!key) throw new InternalServerErrorException('PI_API_KEY is not configured');
    return key;
  }

  async getHistory(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getIncomplete(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, amount: number, memo: string, matchId?: string, eventId?: string) {
    if (!amount || amount <= 0) throw new BadRequestException('Amount must be positive');
    return this.prisma.payment.create({
      data: { userId, amount, memo, matchId, eventId, status: 'PENDING' },
    });
  }

  async approve(paymentId: string) {
    // Validate payment exists in our DB first
    const payment = await this.prisma.payment.findFirst({
      where: { OR: [{ id: paymentId }, { piPaymentId: paymentId }] },
    });

    const piRes = await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${this.apiKey}` },
    });
    if (!piRes.ok) {
      throw new InternalServerErrorException(`Pi approve failed: ${await piRes.text()}`);
    }
    const piData = await piRes.json();

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'APPROVED', piPaymentId: paymentId },
      });
    } else {
      // Payment not in our DB (e.g. recovery flow) — still allow Pi to proceed
    }

    return piData;
  }

  async complete(paymentId: string, txid: string) {
    const piRes = await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid }),
    });
    if (!piRes.ok) {
      throw new InternalServerErrorException(`Pi complete failed: ${await piRes.text()}`);
    }
    const piData = await piRes.json();

    await this.prisma.payment.updateMany({
      where: { piPaymentId: paymentId },
      data: { status: 'COMPLETED', txid },
    });

    return piData;
  }
}
