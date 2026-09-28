import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PaymentsService } from './payments.service';

/**
 * The hourly sweep of stuck payments. A wrong CANCELLED hides real money, so
 * every rule here is about what the sweep must NOT do as much as what it does.
 */

type Row = { id: string; piPaymentId: string | null };

function setup(rows: Row[], piResponses: Record<string, { status: number; body?: unknown }>) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { payment: { findMany, updateMany } };
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const key = Object.keys(piResponses).find((k) => url.endsWith(k));
    const r = key ? piResponses[key] : { status: 500 };
    return Promise.resolve(new Response(JSON.stringify(r.body ?? {}), { status: r.status }));
  }));
  return { service: new PaymentsService(prisma as never), updateMany, findMany, calls };
}

const statusOf = (updateMany: ReturnType<typeof vi.fn>, id: string) =>
  updateMany.mock.calls.find((c) => (c[0] as { where: { id: string } }).where.id === id)?.[0]?.data;

describe('PaymentsService.reconcileStale', () => {
  beforeEach(() => { process.env.PI_API_KEY = 'test-key'; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('only looks at PENDING/APPROVED rows older than an hour', async () => {
    const now = new Date('2026-09-28T12:00:00Z');
    const { service, findMany } = setup([], {});
    await service.reconcileStale(now);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['PENDING', 'APPROVED'] });
    expect(where.createdAt.lt).toEqual(new Date('2026-09-28T11:00:00Z'));
  });

  it('cancels a row that never reached Pi approval, without asking Pi', async () => {
    const { service, updateMany, calls } = setup([{ id: 'p1', piPaymentId: null }], {});
    await service.reconcileStale();
    expect(statusOf(updateMany, 'p1')).toEqual({ status: 'CANCELLED' });
    expect(calls).toHaveLength(0);
  });

  it('cancels what Pi reports as cancelled', async () => {
    const { service, updateMany } = setup([{ id: 'p1', piPaymentId: 'pi1' }], {
      '/payments/pi1': { status: 200, body: { status: { user_cancelled: true } } },
    });
    await service.reconcileStale();
    expect(statusOf(updateMany, 'p1')).toEqual({ status: 'CANCELLED' });
  });

  it('records a completion Pi already has', async () => {
    const { service, updateMany } = setup([{ id: 'p1', piPaymentId: 'pi1' }], {
      '/payments/pi1': { status: 200, body: { status: { developer_completed: true }, transaction: { txid: 'tx9' } } },
    });
    await service.reconcileStale();
    expect(statusOf(updateMany, 'p1')).toEqual({ status: 'COMPLETED', txid: 'tx9' });
  });

  it('completes a payment whose transaction is verified but was never completed', async () => {
    const { service, updateMany, calls } = setup([{ id: 'p1', piPaymentId: 'pi1' }], {
      '/payments/pi1': { status: 200, body: { status: { transaction_verified: true }, transaction: { txid: 'tx9' } } },
      '/payments/pi1/complete': { status: 200 },
    });
    await service.reconcileStale();
    expect(calls).toContain('POST https://api.minepi.com/v2/payments/pi1/complete');
    expect(statusOf(updateMany, 'p1')).toEqual({ status: 'COMPLETED', txid: 'tx9' });
  });

  it('leaves a payment alone when Pi cannot see it (that is what a wrong key looks like)', async () => {
    const { service, updateMany } = setup([{ id: 'p1', piPaymentId: 'pi1' }], {
      '/payments/pi1': { status: 404 },
    });
    await service.reconcileStale();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('leaves a payment the user is still paying', async () => {
    const { service, updateMany } = setup([{ id: 'p1', piPaymentId: 'pi1' }], {
      '/payments/pi1': { status: 200, body: { status: { developer_approved: true } } },
    });
    await service.reconcileStale();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('never overwrites a row that completed meanwhile', async () => {
    const { service, updateMany } = setup([{ id: 'p1', piPaymentId: null }], {});
    await service.reconcileStale();
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', status: { in: ['PENDING', 'APPROVED'] } });
  });
});
