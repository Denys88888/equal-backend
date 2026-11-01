import { describe, it, expect, vi } from 'vitest';
import { UsersService } from './users.service';

function setup(count: number) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  const create = vi.fn(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'new', ...data }));
  const prisma = { photo: { count: vi.fn().mockResolvedValue(count), updateMany, create } };
  const rewards = { refreshProfileCompletion: vi.fn().mockResolvedValue(undefined) };
  return { service: new UsersService(prisma as never, rewards as never), updateMany, create };
}

describe('main photo', () => {
  it('puts a new main photo first in order too, so every screen leads with it', async () => {
    const { service, updateMany, create } = setup(3);
    await service.addPhoto('u1', 'https://x/new.jpg', true);
    expect(updateMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: { isMain: false, order: { increment: 1 } } });
    expect(create).toHaveBeenCalledWith({ data: { userId: 'u1', url: 'https://x/new.jpg', isMain: true, order: 0 } });
  });

  it('adds an ordinary photo at the end and leaves the main one alone', async () => {
    const { service, updateMany, create } = setup(3);
    await service.addPhoto('u1', 'https://x/b.jpg', false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ data: { userId: 'u1', url: 'https://x/b.jpg', isMain: false, order: 3 } });
  });

  it('makes the very first photo the main one', async () => {
    const { service, create } = setup(0);
    await service.addPhoto('u1', 'https://x/a.jpg', false);
    expect(create.mock.calls[0][0].data).toMatchObject({ isMain: true, order: 0 });
  });

  it('reordering makes the first photo the main one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { photo: { updateMany, findMany: vi.fn().mockResolvedValue([]) } };
    await new UsersService(prisma as never, {} as never).reorderPhotos('u1', ['b', 'a']);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'b', userId: 'u1' }, data: { order: 0, isMain: true } });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'a', userId: 'u1' }, data: { order: 1, isMain: false } });
  });
});
