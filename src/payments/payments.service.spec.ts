import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

const OWNER = 'user-owner';
const ATTACKER = 'user-attacker';
const PI_ID = 'pi-payment-123';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    payment: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      ...(overrides.payment as object),
    },
  };
}

function piOk(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('PaymentsService — payment ownership', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.PI_API_KEY = 'test-key';
    fetchSpy = vi.fn().mockResolvedValue(piOk({ metadata: {} }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('approve rejects a linked payment owned by someone else, before calling Pi', async () => {
    const prisma = makePrisma({
      payment: { findFirst: vi.fn().mockResolvedValue({ id: 'row1', userId: OWNER, status: 'PENDING' }) },
    });
    const service = new PaymentsService(prisma as never);

    await expect(service.approve(ATTACKER, PI_ID)).rejects.toThrow(ForbiddenException);
    // The guessed id must not even reach Pi.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('approve rejects when Pi metadata resolves to another user\'s row', async () => {
    const findFirst = vi
      .fn()
      // pre-check: not yet linked
      .mockResolvedValueOnce(null)
      // post-metadata resolution: belongs to the owner
      .mockResolvedValueOnce({ id: 'row1', userId: OWNER, status: 'PENDING' });
    const prisma = makePrisma({ payment: { findFirst } });
    fetchSpy.mockResolvedValue(piOk({ metadata: { paymentIdentifier: 'row1' } }));
    const service = new PaymentsService(prisma as never);

    await expect(service.approve(ATTACKER, PI_ID)).rejects.toThrow(ForbiddenException);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('approve marks the row APPROVED for its rightful owner', async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'row1', userId: OWNER, status: 'PENDING' });
    const prisma = makePrisma({ payment: { findFirst } });
    fetchSpy.mockResolvedValue(piOk({ metadata: { paymentIdentifier: 'row1' } }));
    const service = new PaymentsService(prisma as never);

    await service.approve(OWNER, PI_ID);

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { status: 'APPROVED', piPaymentId: PI_ID },
    });
  });

  it('complete rejects a payment owned by someone else, before calling Pi', async () => {
    const prisma = makePrisma({
      payment: { findFirst: vi.fn().mockResolvedValue({ id: 'row1', userId: OWNER, status: 'APPROVED' }) },
    });
    const service = new PaymentsService(prisma as never);

    await expect(service.complete(ATTACKER, PI_ID, 'tx1')).rejects.toThrow(ForbiddenException);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('complete is idempotent: an already-COMPLETED payment is a no-op', async () => {
    const prisma = makePrisma({
      payment: { findFirst: vi.fn().mockResolvedValue({ id: 'row1', userId: OWNER, status: 'COMPLETED' }) },
    });
    const service = new PaymentsService(prisma as never);

    const result = await service.complete(OWNER, PI_ID, 'tx1');

    expect(result).toEqual({ identifier: PI_ID, status: 'already_completed' });
    // Neither Pi nor the DB is touched a second time — this is what stops a
    // retry from crediting the same purchase twice.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('complete scopes its write to the caller and to non-COMPLETED rows', async () => {
    const prisma = makePrisma({
      payment: { findFirst: vi.fn().mockResolvedValue({ id: 'row1', userId: OWNER, status: 'APPROVED' }) },
    });
    const service = new PaymentsService(prisma as never);

    await service.complete(OWNER, PI_ID, 'tx1');

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { piPaymentId: PI_ID, userId: OWNER, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', txid: 'tx1' },
    });
  });

  it('complete metadata-recovery path is also scoped to the caller', async () => {
    const prisma = makePrisma({
      payment: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    });
    fetchSpy.mockResolvedValue(piOk({ metadata: { paymentIdentifier: 'row9' } }));
    const service = new PaymentsService(prisma as never);

    await service.complete(OWNER, PI_ID, 'tx1');

    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'row9', userId: OWNER, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', txid: 'tx1', piPaymentId: PI_ID },
    });
  });

  it('an unlinked payment still completes for its owner (no false rejection)', async () => {
    const prisma = makePrisma({ payment: { findFirst: vi.fn().mockResolvedValue(null) } });
    const service = new PaymentsService(prisma as never);

    await expect(service.complete(OWNER, PI_ID, 'tx1')).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
