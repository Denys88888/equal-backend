import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DailyMatchService } from './daily-match/daily-match.service';
import { EventsService } from './events/events.service';
import { AdminService, WARN_TRUST_PENALTY } from './admin/admin.service';
import { VerificationService } from './verification/verification.service';
import { UsersService } from './users/users.service';

/**
 * Regression tests for the 2026-09-28 QA pass: each block is a defect that was
 * live in production — money taken twice, rewards promised and never given,
 * feedback thrown away, a penalty that could be applied without limit.
 */

// ── Extra Daily Match ──────────────────────────────────────────────────────

function dailyMatch(opts: { voiceIntro?: boolean; others?: object[]; credit?: boolean }) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'me', name: 'Me', verified: false, trustScore: 50, languages: ['en'], dailyVibe: null,
        voiceIntroUrl: opts.voiceIntro === false ? null : 'https://x/intro.webm',
        profile: { gender: 'man', lookingFor: ['women'], interests: [] },
      }),
      findMany: vi.fn().mockResolvedValue(opts.others ?? []),
    },
    dailyMatch: { findMany: vi.fn().mockResolvedValue([]) },
    payment: {
      findFirst: vi.fn().mockResolvedValue(opts.credit ? { id: 'pay1' } : null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new DailyMatchService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma };
}

const WOMAN = {
  id: 'w1', name: 'W', verified: true, trustScore: 60, languages: ['en'], dailyVibe: null,
  timezone: 'UTC', dailyMatchTime: '15:00', profile: { gender: 'woman', lookingFor: ['men'], interests: [] },
};

describe('Extra Daily Match — pay only for what can be delivered', () => {
  it('tells the app, before any payment, that nobody is available', async () => {
    const { service } = dailyMatch({ others: [] });
    await expect(service.getExtraStatus('me')).resolves.toEqual({ hasCredit: false, available: false, reason: 'no_candidates' });
  });

  it('refuses a buyer without a voice intro before they pay', async () => {
    const { service } = dailyMatch({ voiceIntro: false, others: [WOMAN] });
    await expect(service.getExtraStatus('me')).resolves.toMatchObject({ available: false, reason: 'voice_intro' });
  });

  it('reports an unused paid extra so the app claims it instead of charging again', async () => {
    const { service } = dailyMatch({ credit: true, others: [WOMAN] });
    await expect(service.getExtraStatus('me')).resolves.toEqual({ hasCredit: true, available: true, reason: null });
  });

  it('keeps the payment unused when no one can be matched', async () => {
    const { service, prisma } = dailyMatch({ credit: true, others: [] });
    await expect(service.createExtraMatch('me')).rejects.toThrow(BadRequestException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });

  it('consumes a payment only if nobody else consumed it first', async () => {
    const { service, prisma } = dailyMatch({ credit: true, others: [WOMAN] });
    prisma.payment.updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race
    await expect(service.createExtraMatch('me')).rejects.toThrow(BadRequestException);
    expect(prisma.payment.updateMany.mock.calls[0][0].where).toEqual({ id: 'pay1', consumedAt: null });
  });
});

// ── Events: past RSVPs and feedback ────────────────────────────────────────

function events(opts: { date: Date; rsvp?: string | null; existingFeedback?: boolean }) {
  const award = vi.fn().mockResolvedValue(null);
  const prisma = {
    event: {
      findUnique: vi.fn().mockResolvedValue({
        date: opts.date, status: 'ACTIVE', price: 0, maxAttendees: null, _count: { rsvps: 0 },
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    eventRsvp: {
      findUnique: vi.fn().mockResolvedValue(opts.rsvp ? { status: opts.rsvp } : null),
      upsert: vi.fn().mockResolvedValue({ id: 'r1', status: 'GOING' }),
      count: vi.fn().mockResolvedValue(0),
    },
    eventFeedback: {
      findUnique: vi.fn().mockResolvedValue(opts.existingFeedback ? { rating: 'okay' } : null),
      upsert: vi.fn((args: { create: { rating: string }; update: { rating: string } }) =>
        Promise.resolve({ rating: args.update.rating })),
    },
    payment: { findFirst: vi.fn() },
  };
  return { service: new EventsService(prisma as never, { award } as never), prisma, award };
}

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

describe('Events — the past is read-only', () => {
  it('refuses to RSVP to an event that already happened', async () => {
    const { service } = events({ date: PAST });
    await expect(service.rsvp('e1', 'u1', 'going')).rejects.toThrow('already taken place');
  });

  it('still lets someone withdraw', async () => {
    const { service, prisma } = events({ date: PAST });
    prisma.eventRsvp.upsert.mockResolvedValueOnce({ id: 'r1', status: 'NOT_GOING' });
    await expect(service.rsvp('e1', 'u1', 'not_going')).resolves.toBeTruthy();
  });
});

describe('Events — feedback is stored, from attendees, afterwards', () => {
  it('stores an attendee\'s feedback and grants the sparks once', async () => {
    const { service, prisma, award } = events({ date: PAST, rsvp: 'GOING' });
    await expect(service.submitFeedback('e1', 'u1', 'great')).resolves.toEqual({ success: true, rating: 'great' });
    expect(prisma.eventFeedback.upsert).toHaveBeenCalled();
    expect(award).toHaveBeenCalledWith('u1', 'date_feedback');
  });

  it('changing an answer earns nothing more', async () => {
    const { service, award } = events({ date: PAST, rsvp: 'GOING', existingFeedback: true });
    await service.submitFeedback('e1', 'u1', 'great');
    expect(award).not.toHaveBeenCalled();
  });

  it('refuses feedback before the event', async () => {
    const { service } = events({ date: FUTURE, rsvp: 'GOING' });
    await expect(service.submitFeedback('e1', 'u1', 'great')).rejects.toThrow('not happened yet');
  });

  it('refuses feedback from someone who was not going', async () => {
    const { service } = events({ date: PAST, rsvp: 'INTERESTED' });
    await expect(service.submitFeedback('e1', 'u1', 'great')).rejects.toThrow('Only attendees');
  });
});

// ── Admin: a warning costs trust once ──────────────────────────────────────

describe('AdminService.resolveReport — warn penalty', () => {
  function admin(status: string) {
    const adjustTrust = vi.fn().mockResolvedValue(40);
    const prisma = {
      report: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r1', targetId: 'bad', status }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { updateMany: vi.fn() },
    };
    return { service: new AdminService(prisma as never, { adjustTrust } as never), adjustTrust };
  }

  it('takes trust from the reported user for a pending report', async () => {
    const { service, adjustTrust } = admin('PENDING');
    await service.resolveReport('r1', 'warn');
    expect(adjustTrust).toHaveBeenCalledWith('bad', -WARN_TRUST_PENALTY);
  });

  it('does not take it again when the report was already handled', async () => {
    const { service, adjustTrust } = admin('RESOLVED');
    await service.resolveReport('r1', 'warn');
    expect(adjustTrust).not.toHaveBeenCalled();
  });
});

// ── Verification review ─────────────────────────────────────────────────────

describe('VerificationService.review', () => {
  function review(wasVerified: boolean) {
    const onVerificationChanged = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn((ops: unknown[]) => Promise.all(ops));
    const prisma = {
      verificationRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'v1', userId: 'u1', status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({ status: 'REJECTED' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ verified: wasVerified }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: transaction,
    };
    return { service: new VerificationService(prisma as never, {} as never, { onVerificationChanged } as never), prisma, onVerificationChanged };
  }

  it('rejecting a re-submission does not un-verify someone already verified', async () => {
    const { service, prisma, onVerificationChanged } = review(true);
    await service.review('v1', false);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(onVerificationChanged).toHaveBeenCalledWith('u1', true, true);
  });

  it('approving grants verification and its rewards', async () => {
    const { service, prisma, onVerificationChanged } = review(false);
    await service.review('v1', true);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { verified: true } });
    expect(onVerificationChanged).toHaveBeenCalledWith('u1', false, true);
  });
});

// ── Profile badges from real activity ──────────────────────────────────────

describe('UsersService.getAchievements', () => {
  function users(counts: { clubs: number; great: number; sparks: number; messages: number; daily: number; attended: number },
    user = { verified: true, trustScore: 81 }, complete = true) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      profile: { findUnique: vi.fn().mockResolvedValue({ profileComplete: complete }) },
      clubMember: { count: vi.fn().mockResolvedValue(counts.clubs) },
      eventFeedback: { count: vi.fn().mockResolvedValue(counts.great) },
      swipeAction: { count: vi.fn().mockResolvedValue(counts.sparks) },
      message: { count: vi.fn().mockResolvedValue(counts.messages) },
      dailyMatchMessage: { count: vi.fn().mockResolvedValue(counts.daily) },
      eventRsvp: { count: vi.fn().mockResolvedValue(counts.attended) },
    };
    return { service: new UsersService(prisma as never, {} as never), prisma };
  }

  it('earns each badge exactly at its threshold', async () => {
    const { service } = users({ clubs: 3, great: 3, sparks: 10, messages: 40, daily: 10, attended: 2 });
    await expect(service.getAchievements('u1')).resolves.toEqual({
      verified: true, party: true, pro: true, spark: true, chatty: true, event: true, profile: true, trust: true,
    });
  });

  it('earns nothing one short of each threshold', async () => {
    const { service } = users({ clubs: 2, great: 2, sparks: 9, messages: 49, daily: 0, attended: 1 },
      { verified: false, trustScore: 80 }, false);
    await expect(service.getAchievements('u1')).resolves.toEqual({
      verified: false, party: false, pro: false, spark: false, chatty: false, event: false, profile: false, trust: false,
    });
  });

  it('counts only events that are over', async () => {
    const { service, prisma } = users({ clubs: 0, great: 0, sparks: 0, messages: 0, daily: 0, attended: 0 });
    await service.getAchievements('u1');
    const where = prisma.eventRsvp.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u1', status: 'GOING' });
    expect(where.event.date.lt).toBeInstanceOf(Date);
  });
});
