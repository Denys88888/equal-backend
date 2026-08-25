import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AskService } from './ask.service';

/**
 * Money tests for Equal Ask.
 *
 * These cover the two functions that decide what a user is charged and whether
 * a payment they already made is allowed to buy a question: `priceFor` (quoted
 * to the client, then re-derived server-side at submit time) and
 * `consumePayment` (burns exactly one payment, exactly once).
 *
 * Both are private — deliberately, they must never be reachable from a
 * controller — so they are reached here through index access rather than by
 * widening their visibility just to make them testable.
 */

type PrismaMock = {
  askQuestion: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  payment: { findMany: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  user: { findFirst: ReturnType<typeof vi.fn> };
  swipeAction: { findFirst: ReturnType<typeof vi.fn> };
};

function makePrisma(): PrismaMock {
  return {
    askQuestion: { count: vi.fn(), create: vi.fn() },
    payment: { findMany: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn() },
    swipeAction: { findFirst: vi.fn() },
  };
}

describe('AskService — pricing', () => {
  let service: AskService;
  let prisma: PrismaMock;

  const priceFor = (
    opts: { isAnonymous: boolean; isUrgent: boolean },
  ): Promise<{ price: number; usedFreeToday: boolean; breakdown: Record<string, number> }> =>
    service['priceFor']('asker-1', 'target-1', opts);

  beforeEach(() => {
    prisma = makePrisma();
    service = new AskService(
      prisma as never,
      { isProfane: () => false, clean: (s: string) => s } as never,
      { sendToUser: vi.fn().mockResolvedValue(undefined) } as never,
    );
  });

  it('is free for the first question of the day', async () => {
    prisma.askQuestion.count.mockResolvedValue(0);
    const { price, usedFreeToday, breakdown } = await priceFor({ isAnonymous: false, isUrgent: false });
    expect(price).toBe(0);
    expect(usedFreeToday).toBe(false);
    expect(breakdown).toEqual({});
  });

  it('charges the extra-question surcharge once the free one is used', async () => {
    prisma.askQuestion.count.mockResolvedValue(1);
    const { price, usedFreeToday, breakdown } = await priceFor({ isAnonymous: false, isUrgent: false });
    expect(price).toBe(0.1);
    expect(usedFreeToday).toBe(true);
    expect(breakdown).toEqual({ extra: 0.1 });
  });

  it('charges urgent on its own even when the free question is still available', async () => {
    prisma.askQuestion.count.mockResolvedValue(0);
    const { price, breakdown } = await priceFor({ isAnonymous: false, isUrgent: true });
    expect(price).toBe(0.2);
    expect(breakdown).toEqual({ urgent: 0.2 });
  });

  it('charges anonymous on its own', async () => {
    prisma.askQuestion.count.mockResolvedValue(0);
    const { price, breakdown } = await priceFor({ isAnonymous: true, isUrgent: false });
    expect(price).toBe(0.05);
    expect(breakdown).toEqual({ anonymous: 0.05 });
  });

  it('sums every surcharge without leaking binary floating-point error', async () => {
    prisma.askQuestion.count.mockResolvedValue(1);
    const { price, breakdown } = await priceFor({ isAnonymous: true, isUrgent: true });
    // 0.1 + 0.2 + 0.05 is 0.35000000000000003 before rounding. Quoting that to
    // the client would ask the wallet for an amount that then fails to match.
    expect(price).toBe(0.35);
    expect(String(price)).toBe('0.35');
    expect(breakdown).toEqual({ extra: 0.1, urgent: 0.2, anonymous: 0.05 });
  });

  it('counts only today, scoped to this asker and this target', async () => {
    prisma.askQuestion.count.mockResolvedValue(0);
    await priceFor({ isAnonymous: false, isUrgent: false });

    const where = prisma.askQuestion.count.mock.calls[0][0].where;
    expect(where.askerId).toBe('asker-1');
    expect(where.targetId).toBe('target-1');
    // A UTC midnight boundary, not "24 hours ago" — the free question resets on
    // a calendar day, so the cutoff must land exactly on one.
    const since: Date = where.createdAt.gte;
    expect(since.toISOString()).toMatch(/T00:00:00\.000Z$/);
    expect(since.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('quote() reports free only when nothing is owed', async () => {
    prisma.askQuestion.count.mockResolvedValue(0);
    await expect(service.quote('a', 't', { isAnonymous: false, isUrgent: false }))
      .resolves.toMatchObject({ price: 0, free: true, memo: 'Equal Ask' });

    prisma.askQuestion.count.mockResolvedValue(0);
    await expect(service.quote('a', 't', { isAnonymous: false, isUrgent: true }))
      .resolves.toMatchObject({ price: 0.2, free: false, memo: 'Equal Ask' });
  });
});

describe('AskService — consuming a payment', () => {
  let service: AskService;
  let prisma: PrismaMock;

  const consume = (price: number): Promise<void> => service['consumePayment']('user-1', price);

  beforeEach(() => {
    prisma = makePrisma();
    service = new AskService(
      prisma as never,
      { isProfane: () => false, clean: (s: string) => s } as never,
      { sendToUser: vi.fn().mockResolvedValue(undefined) } as never,
    );
  });

  it('never touches a payment when the question is free', async () => {
    await expect(consume(0)).resolves.toBeUndefined();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('only ever looks at completed, unconsumed payments carrying the Ask memo', async () => {
    prisma.payment.findMany.mockResolvedValue([{ id: 'p1', amount: 1 }]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await consume(0.1);

    expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      status: 'COMPLETED',
      memo: 'Equal Ask',
      consumedAt: null,
    });
  });

  it('rejects when the user has no payment at all', async () => {
    prisma.payment.findMany.mockResolvedValue([]);
    await expect(consume(0.1)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when every payment is worth less than the question costs', async () => {
    // Paying for a cheap question must not unlock an expensive one.
    prisma.payment.findMany.mockResolvedValue([
      { id: 'p1', amount: 0.05 },
      { id: 'p2', amount: 0.1 },
    ]);
    await expect(consume(0.35)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a payment that is short only by floating-point noise', async () => {
    // A wallet that charged 0.1 + 0.2 lands on 0.30000000000000004; the reverse
    // rounding can land just under. Without the epsilon the user pays and is
    // still told to pay.
    prisma.payment.findMany.mockResolvedValue([{ id: 'p1', amount: 0.35 - 1e-9 }]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    await expect(consume(0.35)).resolves.toBeUndefined();
  });

  it('burns the payment it selected, and only while it is still unconsumed', async () => {
    prisma.payment.findMany.mockResolvedValue([{ id: 'p-chosen', amount: 0.35 }]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await consume(0.35);

    const call = prisma.payment.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe('p-chosen');
    // The `consumedAt: null` in the WHERE is the whole concurrency guard: two
    // simultaneous submissions both select this row, and only one update matches.
    expect(call.where.consumedAt).toBeNull();
    expect(call.data.consumedAt).toBeInstanceOf(Date);
  });

  it('rejects when a concurrent request burned the same payment first', async () => {
    prisma.payment.findMany.mockResolvedValue([{ id: 'p1', amount: 0.35 }]);
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });

    // One payment must never buy two questions.
    await expect(consume(0.35)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('spends a payment that covers the price even if a larger one exists', async () => {
    prisma.payment.findMany.mockResolvedValue([
      { id: 'p-small', amount: 0.35 },
      { id: 'p-large', amount: 5 },
    ]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await consume(0.35);

    // findMany is ordered newest-first and `find` takes the first match, so the
    // user's most recent qualifying payment is the one spent.
    expect(prisma.payment.updateMany.mock.calls[0][0].where.id).toBe('p-small');
  });
});

describe('AskService — create guards', () => {
  let service: AskService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AskService(
      prisma as never,
      { isProfane: () => false, clean: (s: string) => s } as never,
      { sendToUser: vi.fn().mockResolvedValue(undefined) } as never,
    );
  });

  it('404s on an unknown profile without charging anything', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.create('asker-1', 'nobody', { content: 'hi' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('refuses a self-ask', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'asker-1' });
    await expect(service.create('asker-1', 'asker-1', { content: 'hi' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('hides a blocked profile as "not found" rather than admitting the block', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.swipeAction.findFirst.mockResolvedValue({ id: 'block-1' });

    await expect(service.create('asker-1', 'target-1', { content: 'hi' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.askQuestion.create).not.toHaveBeenCalled();
  });

  it('checks a block in both directions', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.swipeAction.findFirst.mockResolvedValue(null);
    prisma.askQuestion.count.mockResolvedValue(0);
    prisma.askQuestion.create.mockResolvedValue({
      id: 'q1', status: 'PENDING', createdAt: new Date(),
    });

    await service.create('asker-1', 'target-1', { content: 'hi' });

    const or = prisma.swipeAction.findFirst.mock.calls[0][0].where.OR;
    expect(or).toEqual([
      { userId: 'asker-1', targetId: 'target-1' },
      { userId: 'target-1', targetId: 'asker-1' },
    ]);
  });

  it('creates the question without a payment when it is the free one', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.swipeAction.findFirst.mockResolvedValue(null);
    prisma.askQuestion.count.mockResolvedValue(0);
    prisma.askQuestion.create.mockResolvedValue({
      id: 'q1', status: 'PENDING', createdAt: new Date(),
    });

    await expect(service.create('asker-1', 'target-1', { content: 'hi' }))
      .resolves.toMatchObject({ id: 'q1', status: 'PENDING' });
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('will not create a paid question when the payment is missing', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.swipeAction.findFirst.mockResolvedValue(null);
    prisma.askQuestion.count.mockResolvedValue(1); // free one already used
    prisma.payment.findMany.mockResolvedValue([]);

    await expect(service.create('asker-1', 'target-1', { content: 'hi' }))
      .rejects.toBeInstanceOf(BadRequestException);
    // The question must not exist if it was never paid for.
    expect(prisma.askQuestion.create).not.toHaveBeenCalled();
  });

  it('re-derives the price server-side, so a client cannot ask for a free upgrade', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'target-1' });
    prisma.swipeAction.findFirst.mockResolvedValue(null);
    prisma.askQuestion.count.mockResolvedValue(0);
    // The client paid the 0.05 anonymous surcharge but submits isUrgent too.
    prisma.payment.findMany.mockResolvedValue([{ id: 'p1', amount: 0.05 }]);

    await expect(
      service.create('asker-1', 'target-1', { content: 'hi', isAnonymous: true, isUrgent: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.askQuestion.create).not.toHaveBeenCalled();
  });
});
