import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { recordPayment } from '../common/payment-diagnostics';

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

  /**
   * @param paymentId — the **Pi** payment id from onReadyForServerApproval,
   *   which is not our row id. The two are linked through the metadata the
   *   client attached at createPayment time (see below).
   */
  async approve(userId: string, paymentId: string) {
    console.error(`[payments] approve start piId=${paymentId}`);

    // When the row is already linked (a retry, or onIncompletePaymentFound) we
    // can establish ownership before spending a Pi API call. The unlinked case
    // is re-checked below, once Pi's metadata tells us which row this is.
    const known = await this.prisma.payment.findFirst({ where: { piPaymentId: paymentId } });
    if (known && known.userId !== userId) {
      recordPayment('approve', { paymentId, outcome: 'forbidden' });
      throw new ForbiddenException('Payment belongs to another user');
    }

    let piRes: Response;
    try {
      piRes = await this.piApiFetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Key ${this.apiKey}` },
      });
    } catch (err) {
      console.error(`[payments] approve fetch threw piId=${paymentId}`, err);
      recordPayment('approve', { paymentId, outcome: 'pi_unreachable', piError: String(err) });
      throw new InternalServerErrorException(`Pi approve fetch failed: ${String(err)}`);
    }

    const body = await piRes.text();
    console.error(`[payments] approve pi response piId=${paymentId} status=${piRes.status} body=${body}`);

    if (!piRes.ok) {
      recordPayment('approve', {
        paymentId,
        outcome: 'pi_error',
        piStatus: piRes.status,
        piError: body,
        paymentVisibleToKey: await this.visibleToKey(paymentId),
      });
      throw new InternalServerErrorException(`Pi approve failed ${piRes.status}: ${body}`);
    }
    const piData = JSON.parse(body) as {
      metadata?: { paymentIdentifier?: string };
    };

    // The client puts our row id in metadata.paymentIdentifier at createPayment
    // time, and Pi echoes the metadata back here. That echo is the ONLY link
    // between the Pi payment and our row: looking the row up by the Pi id finds
    // nothing, because piPaymentId is exactly what this call is here to set.
    // Without this the row stays PENDING forever and complete() updates 0 rows.
    const ourId = piData.metadata?.paymentIdentifier;
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          ...(ourId ? [{ id: ourId }] : []),
          { piPaymentId: paymentId },
        ],
      },
    });

    console.error(
      `[payments] approve linked piId=${paymentId} ourId=${ourId ?? 'none'} dbFound=${!!payment}`,
    );

    if (payment) {
      if (payment.userId !== userId) {
        recordPayment('approve', { paymentId, outcome: 'forbidden' });
        throw new ForbiddenException('Payment belongs to another user');
      }
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'APPROVED', piPaymentId: paymentId },
      });
    } else {
      console.error(`[payments] approve: no local row for piId=${paymentId} — cannot mark APPROVED`);
    }

    recordPayment('approve', { paymentId, outcome: 'ok', linked: !!payment });
    return piData;
  }

  /**
   * Can this server's API key see the payment at all? Asked only after Pi
   * rejects an approve/complete, to tell apart the two causes that look
   * identical from the app: 404 means PI_API_KEY belongs to a different app
   * than the one the payment was made in; 200 means the key is right and Pi
   * refused for some other reason (its error body then says which).
   */
  private async visibleToKey(paymentId: string): Promise<boolean | null> {
    try {
      const res = await this.piApiFetch(`${PI_API_BASE}/payments/${paymentId}`, {
        headers: { Authorization: `Key ${this.apiKey}` },
      });
      if (res.status === 200) return true;
      if (res.status === 404) return false;
      return null;
    } catch {
      return null;
    }
  }

  async complete(userId: string, paymentId: string, txid: string) {
    console.error(`[payments] complete start piId=${paymentId} txid=${txid}`);

    const known = await this.prisma.payment.findFirst({ where: { piPaymentId: paymentId } });
    if (known) {
      if (known.userId !== userId) {
        recordPayment('complete', { paymentId, outcome: 'forbidden' });
        throw new ForbiddenException('Payment belongs to another user');
      }
      // Idempotency: the Pi SDK retries complete() (and onIncompletePaymentFound
      // replays it on the next login), so without this a single purchase can be
      // re-processed and credited more than once.
      if (known.status === 'COMPLETED') {
        console.error(`[payments] complete: already COMPLETED piId=${paymentId} — no-op`);
        return { identifier: paymentId, status: 'already_completed' };
      }
    }

    let piRes: Response;
    try {
      piRes = await this.piApiFetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid }),
      });
    } catch (err) {
      console.error(`[payments] complete fetch threw piId=${paymentId}`, err);
      recordPayment('complete', { paymentId, outcome: 'pi_unreachable', piError: String(err) });
      throw new InternalServerErrorException(`Pi complete fetch failed: ${String(err)}`);
    }

    const body = await piRes.text();
    console.error(`[payments] complete pi response piId=${paymentId} status=${piRes.status} body=${body}`);

    if (!piRes.ok) {
      recordPayment('complete', {
        paymentId,
        outcome: 'pi_error',
        piStatus: piRes.status,
        piError: body,
        paymentVisibleToKey: await this.visibleToKey(paymentId),
      });
      throw new InternalServerErrorException(`Pi complete failed ${piRes.status}: ${body}`);
    }
    const piData = JSON.parse(body) as {
      metadata?: { paymentIdentifier?: string };
    };

    // Normally approve() has already stamped piPaymentId. The metadata fallback
    // covers a payment whose approve call didn't link (older rows, or an approve
    // that errored) — without it the row would stay PENDING despite real money
    // having moved, and nothing downstream would ever honour it.
    // Every write is scoped to the caller, so a guessed payment id can never
    // mutate someone else's row even on the recovery path below.
    const updated = await this.prisma.payment.updateMany({
      where: { piPaymentId: paymentId, userId, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', txid },
    });

    let linked = updated.count > 0;
    if (updated.count === 0) {
      const ourId = piData.metadata?.paymentIdentifier;
      if (ourId) {
        const recovered = await this.prisma.payment.updateMany({
          where: { id: ourId, userId, status: { not: 'COMPLETED' } },
          data: { status: 'COMPLETED', txid, piPaymentId: paymentId },
        });
        linked = recovered.count > 0;
        console.error(
          `[payments] complete recovered via metadata piId=${paymentId} ourId=${ourId} rows=${recovered.count}`,
        );
      } else {
        console.error(`[payments] complete: no local row for piId=${paymentId} — money moved, row not updated`);
      }
    }

    recordPayment('complete', { paymentId, outcome: 'ok', linked });
    return piData;
  }
}
