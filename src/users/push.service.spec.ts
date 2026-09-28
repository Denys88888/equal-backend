import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

/**
 * Push notifications must respect the Settings toggles. Before, "New matches"
 * and "Messages" switches were local state and every push went out anyway.
 */

const sendNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

// VAPID keys are read when the module loads, so set them before importing it.
let PushService: typeof import('./push.service').PushService;
beforeAll(async () => {
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  ({ PushService } = await import('./push.service'));
});

const payload = { title: 'match_title' as const, body: 'match_body' as const, params: { name: 'Anna' } };

function serviceFor(user: Record<string, unknown> | null) {
  const findUnique = vi.fn().mockResolvedValue(user);
  const prisma = { user: { findUnique, update: vi.fn() } };
  return { service: new PushService(prisma as never), findUnique };
}

describe('PushService.sendToUser — notification preferences', () => {
  beforeEach(() => sendNotification.mockClear());

  it('does not send a message push when Messages is switched off', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' }, notifyMessages: false });
    await service.sendToUser('u1', payload, 'messages');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends it when Messages is on', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' }, notifyMessages: true });
    await service.sendToUser('u1', payload, 'messages');
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('reads the toggle that belongs to the category, not another one', async () => {
    const { service, findUnique } = serviceFor({ pushSubscription: { endpoint: 'x' }, notifyMatches: true });
    await service.sendToUser('u1', payload, 'matches');
    const select = (findUnique.mock.calls[0][0] as { select: Record<string, boolean> }).select;
    expect(select).toEqual({ pushSubscription: true, locale: true, notifyMatches: true });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('still sends notifications no toggle covers', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' } });
    await service.sendToUser('u1', payload);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe('PushService — written in the recipient\'s language', () => {
  beforeEach(() => sendNotification.mockClear());
  const sent = () => JSON.parse(sendNotification.mock.calls[0][1] as string);

  it('renders in the locale the app saved', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' }, locale: 'ru' });
    await service.sendToUser('u1', { title: 'match_title', body: 'match_body', params: { name: 'Anna' } });
    expect(sent()).toMatchObject({ title: 'Это мэтч! 💜', body: 'Вы с Anna понравились друг другу!' });
  });

  it('says "Someone" in that language when the name is missing', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' }, locale: 'de' });
    await service.sendToUser('u1', { title: 'msg_title', body: 'msg_new', params: { name: null } });
    expect(sent().title).toBe('Neue Nachricht von Jemand');
  });

  it('falls back to English for an unknown locale and passes message text through', async () => {
    const { service } = serviceFor({ pushSubscription: { endpoint: 'x' }, locale: 'xx' });
    await service.sendToUser('u1', { title: 'msg_title', body: { text: 'hey there' }, params: { name: 'Bo' } });
    expect(sent()).toMatchObject({ title: 'New message from Bo', body: 'hey there' });
  });
});
