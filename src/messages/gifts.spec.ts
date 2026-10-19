import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PaymentsService } from '../payments/payments.service';
import { countGiftsReceived, GIFT_PRICES } from './gift-catalog';

/**
 * A paid gift used to need no payment: the message was created from whatever
 * giftType the app sent, so anyone could send a "10 π diamond" for free and
 * a profile's gift count meant nothing.
 */

function messages(redeem = vi.fn().mockResolvedValue(undefined)) {
  const create = vi.fn(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'm1', createdAt: new Date(), ...data }));
  const prisma = {
    match: { findUnique: vi.fn().mockResolvedValue({ id: 'match1', user1Id: 'alice', user2Id: 'bob' }) },
    swipeAction: { findFirst: vi.fn().mockResolvedValue(null) },
    message: { create },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice' }) },
  };
  const push = { sendToUser: vi.fn().mockResolvedValue(undefined) };
  const gateway = { server: { to: () => ({ emit: vi.fn() }) } };
  const service = new MessagesService(prisma as never, push as never, gateway as never, { redeemForGift: redeem } as never);
  return { service, create, redeem };
}

describe('sending a gift', () => {
  it('refuses a gift kind the server does not sell', async () => {
    const { service, create } = messages();
    await expect(service.create('match1', 'alice', 'x', 'GIFT', 'yacht')).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('sends the free spark without any payment', async () => {
    const { service, create, redeem } = messages();
    await service.create('match1', 'alice', 'spark', 'GIFT', 'spark');
    expect(redeem).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
  });

  it('redeems a payment of at least the price before a paid gift is created', async () => {
    const { service, create, redeem } = messages();
    await service.create('match1', 'alice', 'diamond', 'GIFT', 'diamond', 'pi_123');
    expect(redeem).toHaveBeenCalledWith('alice', 'pi_123', GIFT_PRICES.diamond);
    expect(create).toHaveBeenCalled();
  });

  it('creates nothing when the payment does not hold up', async () => {
    const { service, create } = messages(vi.fn().mockRejectedValue(new BadRequestException('no')));
    await expect(service.create('match1', 'alice', 'rose', 'GIFT', 'rose')).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.redeemForGift', () => {
  const env = process.env.PI_API_KEY;
  beforeEach(() => { process.env.PI_API_KEY = 'test-key'; });
  afterEach(() => { process.env.PI_API_KEY = env; vi.unstubAllGlobals(); });

  function payments(row: Record<string, unknown> | null, pi: unknown, piOk = true, claimed = 1) {
    const updateMany = vi.fn().mockResolvedValue({ count: claimed });
    const prisma = { payment: { findFirst: vi.fn().mockResolvedValue(row), updateMany } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: piOk, status: piOk ? 200 : 500, json: async () => pi }));
    return { service: new PaymentsService(prisma as never), updateMany };
  }
  const row = { id: 'row1', userId: 'alice', memo: 'Gift: Rose to Bob', consumedAt: null };
  const paid = (amount: number) => ({ amount, metadata: { paymentIdentifier: 'row1' }, status: { developer_completed: true } });

  it('accepts a completed gift payment once, and marks it used', async () => {
    const { service, updateMany } = payments(row, paid(2));
    await expect(service.redeemForGift('alice', 'pi_1', 2)).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'row1', consumedAt: null } }));
  });

  it('checks the amount Pi actually took, not the amount on our row', async () => {
    const { service } = payments({ ...row, amount: 10 }, paid(0.01));
    await expect(service.redeemForGift('alice', 'pi_1', 10)).rejects.toThrow(/less than the price/);
  });

  it('accepts a payment whose transaction is verified while Pi still catches up on developer_completed', async () => {
    const { service } = payments(row, { amount: 2, metadata: { paymentIdentifier: 'row1' }, status: { developer_completed: false, transaction_verified: true } });
    await expect(service.redeemForGift('alice', 'pi_1', 2)).resolves.toBeUndefined();
  });

  it('refuses a payment Pi has not completed', async () => {
    const { service } = payments(row, { amount: 2, status: { developer_completed: false } });
    await expect(service.redeemForGift('alice', 'pi_1', 2)).rejects.toThrow(/not completed/);
  });

  it('refuses without a payment, someone else\'s payment, or a non-gift payment', async () => {
    await expect(payments(row, paid(2)).service.redeemForGift('alice', undefined, 2)).rejects.toBeInstanceOf(BadRequestException);
    await expect(payments(null, paid(2)).service.redeemForGift('alice', 'pi_1', 2)).rejects.toThrow(/not found/);
    await expect(payments({ ...row, memo: 'Ticket: Party' }, paid(2)).service.redeemForGift('alice', 'pi_1', 2)).rejects.toThrow(/not found/);
  });

  it('refuses a payment that already bought a gift, including a concurrent second claim', async () => {
    await expect(payments({ ...row, consumedAt: new Date() }, paid(2)).service.redeemForGift('alice', 'pi_1', 2)).rejects.toThrow(/already used/);
    await expect(payments(row, paid(2), true, 0).service.redeemForGift('alice', 'pi_1', 2)).rejects.toThrow(/already used/);
  });

  it('asks the user to retry when Pi cannot be reached, leaving the payment unused', async () => {
    const { service, updateMany } = payments(row, null, false);
    await expect(service.redeemForGift('alice', 'pi_1', 2)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('countGiftsReceived', () => {
  it('counts gifts others sent to the user, by kind, ignoring unknown kinds', async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { giftType: 'rose', _count: { _all: 5 } },
      { giftType: 'coffee', _count: { _all: 3 } },
      { giftType: 'legacy-thing', _count: { _all: 9 } },
    ]);
    await expect(countGiftsReceived({ message: { groupBy } } as never, 'bob')).resolves.toEqual({ rose: 5, coffee: 3 });
    expect(groupBy.mock.calls[0][0].where.senderId).toEqual({ not: 'bob' });
  });
});
