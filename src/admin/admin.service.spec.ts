import { describe, it, expect, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

const HOUR = 60 * 60 * 1000;

function makePrisma(users: unknown[] = [], found: unknown = { id: 'u1' }) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue(users),
      findUnique: vi.fn().mockResolvedValue(found),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'Alice',
    email: null,
    trustScore: 50,
    verified: false,
    isActive: true,
    bannedUntil: null,
    badges: [],
    createdAt: new Date(),
    profile: { bio: '' },
    _count: { matches1: 0, matches2: 0 },
    ...over,
  };
}

describe('AdminService — ban lifecycle', () => {
  it('unban clears bannedUntil, not just isActive', async () => {
    const prisma = makePrisma();
    const service = new AdminService(prisma as never);

    await service.setBan('u1', false);

    // Without bannedUntil: null an auto-banned account stays locked out and the
    // admin has no way to release it before the timer expires.
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: true, bannedUntil: null },
    });
  });

  it('ban deactivates the account', async () => {
    const prisma = makePrisma();
    const service = new AdminService(prisma as never);

    await service.setBan('u1', true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isActive: false },
    });
  });

  it('rejects an unknown user', async () => {
    const prisma = makePrisma([], null);
    const service = new AdminService(prisma as never);

    await expect(service.setBan('nope', false)).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reports an auto-banned user (bannedUntil in the future) as Banned', async () => {
    const prisma = makePrisma([row({ isActive: true, bannedUntil: new Date(Date.now() + HOUR) })]);
    const service = new AdminService(prisma as never);

    const [user] = await service.getUsers();

    // Reported as Active, the admin UI would show no unban button for exactly
    // the accounts that need one.
    expect(user.status).toBe('Banned');
  });

  it('reports a deactivated user as Banned', async () => {
    const prisma = makePrisma([row({ isActive: false })]);
    const service = new AdminService(prisma as never);

    const [user] = await service.getUsers();
    expect(user.status).toBe('Banned');
  });

  it('reports a user whose ban already elapsed as Active', async () => {
    const prisma = makePrisma([row({ isActive: true, bannedUntil: new Date(Date.now() - HOUR) })]);
    const service = new AdminService(prisma as never);

    const [user] = await service.getUsers();
    expect(user.status).toBe('Active');
  });

  it('reports an ordinary user as Active', async () => {
    const prisma = makePrisma([row()]);
    const service = new AdminService(prisma as never);

    const [user] = await service.getUsers();
    expect(user.status).toBe('Active');
  });
});
