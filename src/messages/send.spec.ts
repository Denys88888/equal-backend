import { describe, it, expect, vi } from 'vitest';
import { MessagesService } from './messages.service';
import { MatchesService } from '../matches/matches.service';

function setup(mutedBy: string[] = []) {
  const created = { id: 'm1', matchId: 'match1', senderId: 'alice', content: 'hi', type: 'TEXT', giftType: null, read: false, createdAt: new Date('2026-10-31T20:00:00Z') };
  const prisma = {
    match: { findUnique: vi.fn().mockResolvedValue({ id: 'match1', user1Id: 'alice', user2Id: 'bob', mutedBy }) },
    swipeAction: { findFirst: vi.fn().mockResolvedValue(null) },
    message: { create: vi.fn().mockResolvedValue(created) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Alice' }) },
  };
  const push = { sendToUser: vi.fn().mockResolvedValue(undefined) };
  const gateway = { server: { to: () => ({ emit: vi.fn() }) } };
  return { service: new MessagesService(prisma as never, push as never, gateway as never, {} as never), push };
}

describe('sending a message', () => {
  it('answers in the same shape as the history, so the sender sees it on their own side', async () => {
    const { service } = setup();
    const msg = await service.create('match1', 'alice', 'hi');
    expect(msg).toMatchObject({ id: 'm1', sender: 'me', timestamp: new Date('2026-10-31T20:00:00Z') });
  });

  it('sends no push to a partner who muted the conversation', async () => {
    const muted = setup(['bob']);
    await muted.service.create('match1', 'alice', 'hi');
    expect(muted.push.sendToUser).not.toHaveBeenCalled();

    const open = setup();
    await open.service.create('match1', 'alice', 'hi');
    expect(open.push.sendToUser).toHaveBeenCalledWith('bob', expect.anything(), 'messages');
  });

  it('tells the recipient\'s app about the message even when the chat is closed', async () => {
    const emit = vi.fn();
    const { service } = setup();
    (service as unknown as { gateway: unknown }).gateway = { server: { to: (room: string) => ({ emit: (ev: string, data: unknown) => emit(room, ev, data) }) } };
    await service.create('match1', 'alice', 'hi');
    expect(emit).toHaveBeenCalledWith('user:bob', 'message:notify', expect.objectContaining({ matchId: 'match1', senderName: 'Alice', preview: 'hi' }));
  });
});

describe('muting a conversation', () => {
  it('adds and removes only the caller, and refuses someone else\'s match', async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({ id: 'match1', user1Id: 'alice', user2Id: 'bob', mutedBy: ['bob'] });
    const service = new MatchesService({ match: { findUnique, update } } as never, {} as never);
    await service.setMuted('match1', 'alice', true);
    expect(update).toHaveBeenLastCalledWith({ where: { id: 'match1' }, data: { mutedBy: ['bob', 'alice'] } });
    await service.setMuted('match1', 'bob', false);
    expect(update).toHaveBeenLastCalledWith({ where: { id: 'match1' }, data: { mutedBy: [] } });
    await expect(service.setMuted('match1', 'eve', true)).rejects.toThrow(/Not your match/);
  });
});
