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

  private async piApiFetch(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      console.error(`[payments] pi api fetch error url=${url}`, err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async approve(paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { OR: [{ id: paymentId }, { piPaymentId: paymentId }] },
    });

    console.error(`[payments] approve start piId=${paymentId} dbFound=${!!payment}`);

    let piRes: Response;
    try {
      piRes = await this.piApiFetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Key ${this.apiKey}` },
      });
    } catch (err) {
      console.error(`[payments] approve fetch threw piId=${paymentId}`, err);
      throw new InternalServerErrorException(`Pi approve fetch failed: ${String(err)}`);
    }

    const body = await piRes.text();
    console.error(`[payments] approve pi response piId=${paymentId} status=${piRes.status} body=${body}`);

    if (!piRes.ok) {
      throw new InternalServerErrorException(`Pi approve failed ${piRes.status}: ${body}`);
    }
    const piData = JSON.parse(body);

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'APPROVED', piPaymentId: paymentId },
      });
    }

    return piData;
  }

  async complete(paymentId: string, txid: string) {
    console.error(`[payments] complete start piId=${paymentId} txid=${txid}`);

    let piRes: Response;
    try {
      piRes = await this.piApiFetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid }),
      });
    } catch (err) {
      console.error(`[payments] complete fetch threw piId=${paymentId}`, err);
      throw new InternalServerErrorException(`Pi complete fetch failed: ${String(err)}`);
    }

    const body = await piRes.text();
    console.error(`[payments] complete pi response piId=${paymentId} status=${piRes.status} body=${body}`);

    if (!piRes.ok) {
      throw new InternalServerErrorException(`Pi complete failed ${piRes.status}: ${body}`);
    }
    const piData = JSON.parse(body);

    await this.prisma.payment.updateMany({
      where: { piPaymentId: paymentId },
      data: { status: 'COMPLETED', txid },
    });

    return piData;
  }
}
