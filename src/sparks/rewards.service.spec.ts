import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { RewardsService, VERIFIED_TRUST_BONUS } from './rewards.service';

/**
 * The Profile screen promised sparks and trust for verifying and completing a
 * profile, and nothing ever granted them. These pin that the grants happen,
 * happen once, stay inside 0–100, and never break the action that earned them.
 */

function setup(opts: { trust?: number; profile?: Record<string, unknown> | null; photos?: number } = {}) {
  const earn = vi.fn().mockResolvedValue({ earned: 1, newBalance: 1 });
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ trustScore: opts.trust ?? 50 }),
      update: vi.fn().mockResolvedValue({}),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue(opts.profile === undefined ? null : opts.profile),
      update: vi.fn((args: { data: object }) => Promise.resolve({ ...opts.profile, ...args.data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    photo: { count: vi.fn().mockResolvedValue(opts.photos ?? 0) },
  };
  const service = new RewardsService(prisma as never, { earn } as never);
  return { service, prisma, earn };
}

const FULL_PROFILE = {
  bio: 'hi', birthDate: new Date('2000-01-01'), city: 'Kyiv', gender: 'man',
  interests: ['a', 'b', 'c'], goals: ['serious'],
};

describe('RewardsService.award', () => {
  it('treats "already claimed / not eligible" as a normal no-op', async () => {
    const { service, earn } = setup();
    earn.mockRejectedValueOnce(new BadRequestException('already claimed'));
    await expect(service.award('u1', 'verification')).resolves.toBeNull();
  });

  it('never throws into the action that earned the reward', async () => {
    const { service, earn } = setup();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    earn.mockRejectedValueOnce(new Error('db down'));
    await expect(service.award('u1', 'club_activity')).resolves.toBeNull();
    log.mockRestore();
  });
});

describe('RewardsService.refreshProfileCompletion', () => {
  it('a photo completing the profile marks it complete and grants the sparks', async () => {
    const { service, prisma, earn } = setup({ profile: FULL_PROFILE, photos: 1 });
    const updated = await service.refreshProfileCompletion('u1');
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { completionPercent: 100, profileComplete: true },
    });
    expect(updated?.profileComplete).toBe(true);
    expect(earn).toHaveBeenCalledWith('u1', 'complete_profile');
  });

  it('an incomplete profile earns nothing', async () => {
    const { service, earn } = setup({ profile: FULL_PROFILE, photos: 0 });
    const updated = await service.refreshProfileCompletion('u1');
    expect(updated?.profileComplete).toBe(false);
    expect(earn).not.toHaveBeenCalled();
  });

  it('does nothing for a user with no profile yet', async () => {
    const { service, earn } = setup({ profile: null });
    await expect(service.refreshProfileCompletion('u1')).resolves.toBeNull();
    expect(earn).not.toHaveBeenCalled();
  });
});

describe('RewardsService — verification and trust', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup({ trust: 50 }); });

  it('getting verified adds trust on User and Profile and grants the sparks', async () => {
    await s.service.onVerificationChanged('u1', false, true);
    expect(s.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { trustScore: 50 + VERIFIED_TRUST_BONUS } });
    expect(s.prisma.profile.updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { trustScore: 50 + VERIFIED_TRUST_BONUS } });
    expect(s.earn).toHaveBeenCalledWith('u1', 'verification');
  });

  it('staying verified changes nothing (no double bonus)', async () => {
    await s.service.onVerificationChanged('u1', true, true);
    expect(s.prisma.user.update).not.toHaveBeenCalled();
    expect(s.earn).not.toHaveBeenCalled();
  });

  it('losing verification takes the bonus back and grants nothing', async () => {
    await s.service.onVerificationChanged('u1', true, false);
    expect(s.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { trustScore: 50 - VERIFIED_TRUST_BONUS } });
    expect(s.earn).not.toHaveBeenCalled();
  });

  it('keeps trust within 0–100', async () => {
    const high = setup({ trust: 95 });
    await expect(high.service.adjustTrust('u1', 20)).resolves.toBe(100);
    const low = setup({ trust: 5 });
    await expect(low.service.adjustTrust('u1', -10)).resolves.toBe(0);
  });
});
