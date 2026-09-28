import { describe, it, expect, beforeEach, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSettingsDto } from './users.dto';
import { UsersService } from './users.service';
import { ProfilesService } from '../profiles/profiles.service';
import { DailyMatchService } from '../daily-match/daily-match.service';

/**
 * Settings → Privacy / Notifications.
 *
 * All six toggles used to be React state that reset on every visit and did
 * nothing: Ghost Mode told people their profile was hidden while it stayed in
 * everyone's deck. These tests pin the three things that make them real —
 * the values persist, only these values can be written through the route, and
 * Ghost Mode actually removes the user from Discover.
 */

async function errorsFor(body: object) {
  return validate(plainToInstance(UpdateSettingsDto, body), { whitelist: true, forbidNonWhitelisted: false });
}

describe('UpdateSettingsDto', () => {
  it('accepts a single boolean toggle', async () => {
    expect(await errorsFor({ ghostMode: true })).toHaveLength(0);
    expect(await errorsFor({ notifyMessages: false })).toHaveLength(0);
  });

  it('rejects a non-boolean, including the string "true"', async () => {
    expect(await errorsFor({ ghostMode: 'true' })).not.toHaveLength(0);
    expect(await errorsFor({ verifiedOnly: 1 })).not.toHaveLength(0);
  });
});

describe('UsersService.updateSettings', () => {
  const update = vi.fn().mockResolvedValue({});
  const service = new UsersService({ user: { update } } as never);

  beforeEach(() => update.mockClear());

  it('writes only the six setting columns, never anything else in the body', async () => {
    await service.updateSettings('u1', {
      ghostMode: true,
      notifyClubs: false,
      // Not part of the DTO; the pipe strips these, and the service must too.
      role: 'ADMIN',
      sparkBalance: 9999,
      verified: true,
    } as never);

    const { where, data, select } = update.mock.calls[0][0] as unknown as {
      where: object; data: Record<string, unknown>; select: Record<string, boolean>;
    };
    expect(where).toEqual({ id: 'u1' });
    expect(data).toEqual({ ghostMode: true, notifyClubs: false });
    expect(Object.keys(select).sort()).toEqual(
      ['ghostMode', 'notifyClubs', 'notifyEvents', 'notifyMatches', 'notifyMessages', 'verifiedOnly'],
    );
  });

  it('ignores non-boolean values instead of coercing them', async () => {
    await service.updateSettings('u1', { ghostMode: 'yes' } as never);
    expect((update.mock.calls[0][0] as unknown as { data: object }).data).toEqual({});
  });
});

describe('ProfilesService.discover — Ghost Mode', () => {
  it('never returns users who turned Ghost Mode on', async () => {
    const userFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      swipeAction: { findMany: vi.fn().mockResolvedValue([]) },
      profile: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findMany: userFindMany },
    };
    const service = new ProfilesService(prisma as never, {} as never, {} as never);

    await service.discover('me', {});

    const where = (userFindMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.ghostMode).toBe(false);
  });
});

describe('DailyMatchService — Ghost Mode', () => {
  it('leaves users in Ghost Mode out of the daily pairing pool', async () => {
    const userFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      user: { findMany: userFindMany },
      dailyMatch: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new DailyMatchService(prisma as never, {} as never, {} as never, {} as never, {} as never);

    await (service as unknown as { loadEligibleUsers: () => Promise<unknown> }).loadEligibleUsers();

    const where = (userFindMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where.ghostMode).toBe(false);
  });
});
