import { describe, it, expect, vi } from 'vitest';
import { ClubsService } from './clubs.service';

describe('ClubsService.create', () => {
  function setup() {
    const prisma = {
      club: { create: vi.fn((args: { data: object }) => Promise.resolve({ id: 'c1', ...args.data })) },
      clubMember: { create: vi.fn().mockResolvedValue({}) },
    };
    return { prisma, service: new ClubsService(prisma as never, {} as never) };
  }

  it('writes only the allowed fields, PENDING and owned by the caller', async () => {
    const { prisma, service } = setup();

    // Even if a field slipped past the DTO, the service must not forward it.
    await service.create(
      { name: '  Warsaw Hikers ', description: ' trails ', category: 'Sports', memberCount: 99999 } as never,
      'user-1',
    );

    expect(prisma.club.create).toHaveBeenCalledWith({
      data: {
        name: 'Warsaw Hikers',
        description: 'trails',
        category: 'Sports',
        createdBy: 'user-1',
        status: 'PENDING',
      },
    });
  });

  it('makes the creator the club admin', async () => {
    const { prisma, service } = setup();
    await service.create({ name: 'Warsaw Hikers', category: 'Sports' }, 'user-1');
    expect(prisma.clubMember.create).toHaveBeenCalledWith({
      data: { clubId: 'c1', userId: 'user-1', role: 'ADMIN' },
    });
  });
});
