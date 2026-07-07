import { Injectable, InternalServerErrorException } from '@nestjs/common';

const PI_API_BASE = 'https://api.minepi.com/v2';

@Injectable()
export class PaymentsService {
  private get apiKey(): string {
    return process.env.PI_API_KEY || '';
  }

  async approve(paymentId: string) {
    const res = await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Key ${this.apiKey}` },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new InternalServerErrorException(`Pi approve failed: ${err}`);
    }
    return res.json();
  }

  async complete(paymentId: string, txid: string) {
    const res = await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new InternalServerErrorException(`Pi complete failed: ${err}`);
    }
    return res.json();
  }
}
