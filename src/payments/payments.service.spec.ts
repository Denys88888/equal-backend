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

describe('PaymentsService — /v1/health payment diagnostics', () => {
  const FULL_ID = 'abcdefghijklmnop_PAY123';

  function res(status: number, body: unknown) {
    return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(JSON.stringify(body)) } as unknown as Response;
  }

  /** Route-aware fake: approve/complete answer `action`, GET /payments/:id answers `lookup`. */
  function routedFetch(action: Response, lookup: Response) {
    return vi.fn((url: string, init?: RequestInit) => {
      const isAction = /\/(approve|complete)$/.test(url) && init?.method === 'POST';
      return Promise.resolve(isAction ? action : lookup);
    });
  }

  beforeEach(async () => {
    process.env.PI_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (await import('../common/payment-diagnostics')).resetPaymentDiagnostics();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a Pi rejection whose payment the key cannot see is reported as visible:false (key belongs to another app)', async () => {
    vi.stubGlobal('fetch', routedFetch(res(404, { error: 'payment_not_found' }), res(404, {})));
    const { paymentDiagnostics } = await import('../common/payment-diagnostics');
    const service = new PaymentsService(makePrisma() as never);

    await expect(service.approve(OWNER, FULL_ID)).rejects.toThrow();

    const d = paymentDiagnostics().approve!;
    expect(d.outcome).toBe('pi_error');
    expect(d.piStatus).toBe(404);
    expect(d.piError).toContain('payment_not_found');
    expect(d.paymentVisibleToKey).toBe(false);
  });

  it('a Pi rejection of a payment the key CAN see is reported as visible:true (key is right, Pi refused)', async () => {
    vi.stubGlobal('fetch', routedFetch(res(400, { error: 'some_other_reason' }), res(200, {})));
    const { paymentDiagnostics } = await import('../common/payment-diagnostics');
    const service = new PaymentsService(makePrisma() as never);

    await expect(service.approve(OWNER, FULL_ID)).rejects.toThrow();

    expect(paymentDiagnostics().approve!.paymentVisibleToKey).toBe(true);
  });

  it('never exposes a successful Pi response or the full payment id on the public health endpoint', async () => {
    const successBody = {
      metadata: { paymentIdentifier: 'row1' },
      user_uid: 'SECRET-USER-UID',
      from_address: 'GUSERWALLETADDRESS',
    };
    vi.stubGlobal('fetch', routedFetch(res(200, successBody), res(200, {})));
    const { paymentDiagnostics } = await import('../common/payment-diagnostics');
    const prisma = makePrisma({
      payment: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'row1', userId: OWNER }) },
    });
    const service = new PaymentsService(prisma as never);

    await service.approve(OWNER, FULL_ID);

    const exposed = JSON.stringify(paymentDiagnostics());
    expect(paymentDiagnostics().approve).toMatchObject({ outcome: 'ok', linked: true, paymentRef: 'PAY123' });
    expect(exposed).not.toContain('SECRET-USER-UID');
    expect(exposed).not.toContain('GUSERWALLETADDRESS');
    expect(exposed).not.toContain(FULL_ID);
  });
});
