import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatGateway } from './chat.gateway';
import { iceServers, resetIceServerCache, turnDiagnostics } from './ice-servers';

/**
 * Video calls used to signal through the match room, which only holds people
 * with that chat open — the callee never got the offer, so calls never rang.
 */

function setup({ partnerOnline = false, partner = { isActive: true, isDemo: false } } = {}) {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  const matchFind = vi.fn().mockResolvedValue({ user1Id: 'caller', user2Id: 'callee' });
  const userFind = vi.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === 'caller' ? { name: 'Vlad', photos: [{ url: 'https://x/vlad.jpg' }] } : partner),
  );
  const prisma = { match: { findFirst: matchFind }, user: { findUnique: userFind } };
  const push = { sendToUser: vi.fn().mockResolvedValue(undefined) };
  const gateway = new ChatGateway({} as never, prisma as never, push as never);
  gateway.server = { to } as never;
  if (partnerOnline) (gateway as unknown as { online: Map<string, number> }).online.set('callee', 1);
  const client = { userId: 'caller', data: {} } as never;
  return { gateway, client, to, emit, matchFind, push };
}

describe('video call signaling', () => {
  it('rings the callee in their own user room, with the caller\'s name and photo', async () => {
    const { gateway, client, to, emit } = setup({ partnerOnline: true });
    const ack = await gateway.handleCallInvite(client, { matchId: 'm1' });
    expect(ack).toEqual({ ok: true, online: true });
    expect(to).toHaveBeenCalledWith('user:callee');
    expect(emit).toHaveBeenCalledWith('call:incoming', {
      matchId: 'm1', fromUserId: 'caller', name: 'Vlad', photo: 'https://x/vlad.jpg',
    });
  });

  it('sends a push that opens the answer screen when the callee has the app closed', async () => {
    const { gateway, client, push } = setup({ partnerOnline: false });
    await gateway.handleCallInvite(client, { matchId: 'm1' });
    expect(push.sendToUser).toHaveBeenCalledWith('callee', expect.objectContaining({
      title: 'call_title', body: 'call_body', params: { name: 'Vlad' }, url: '/#/video/m1?answer=1',
    }));
  });

  it('does not push to someone who is online — the in-app screen rings instead', async () => {
    const { gateway, client, push } = setup({ partnerOnline: true });
    await gateway.handleCallInvite(client, { matchId: 'm1' });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('refuses a call to a fake profile, which nobody can answer', async () => {
    const { gateway, client, emit } = setup({ partner: { isActive: true, isDemo: true } });
    expect(await gateway.handleCallInvite(client, { matchId: 'm1' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses someone who is not in the match', async () => {
    const { gateway, client, matchFind, emit } = setup();
    matchFind.mockResolvedValueOnce(null);
    expect(await gateway.handleCallInvite(client, { matchId: 'other' })).toEqual({ ok: false, reason: 'not_a_participant' });
    expect(emit).not.toHaveBeenCalled();
  });

  it('relays the offer, answer and candidates to the partner, checking the match once', async () => {
    const { gateway, client, to, emit, matchFind } = setup();
    await gateway.handleCallOffer(client, { matchId: 'm1', offer: { type: 'offer', sdp: 'v=0' } });
    for (let i = 0; i < 5; i++) await gateway.handleCallIce(client, { matchId: 'm1', candidate: { candidate: `c${i}` } });
    expect(to).toHaveBeenCalledWith('user:callee');
    expect(emit).toHaveBeenCalledWith('call:offer', { matchId: 'm1', fromUserId: 'caller', offer: { type: 'offer', sdp: 'v=0' } });
    expect(emit).toHaveBeenCalledWith('call:ice', { matchId: 'm1', fromUserId: 'caller', candidate: { candidate: 'c4' } });
    expect(matchFind).toHaveBeenCalledTimes(1);
  });

  it('drops a malformed or oversized description instead of relaying it', async () => {
    const { gateway, client, emit } = setup();
    expect(await gateway.handleCallOffer(client, { matchId: 'm1', offer: { type: 'answer', sdp: 'v=0' } })).toEqual({ ok: false });
    expect(await gateway.handleCallAnswer(client, { matchId: 'm1', answer: { type: 'answer', sdp: 'x'.repeat(20001) } })).toEqual({ ok: false });
    expect(emit).not.toHaveBeenCalled();
  });

  it('tells the caller whether the decline was "busy"', async () => {
    const { gateway, client, emit } = setup();
    await gateway.handleCallDecline(client, { matchId: 'm1', reason: 'busy' });
    await gateway.handleCallDecline(client, { matchId: 'm1', reason: 'anything else' });
    expect(emit).toHaveBeenNthCalledWith(1, 'call:declined', { matchId: 'm1', fromUserId: 'caller', reason: 'busy' });
    expect(emit).toHaveBeenNthCalledWith(2, 'call:declined', { matchId: 'm1', fromUserId: 'caller', reason: 'declined' });
  });
});

describe('ICE servers', () => {
  const env = { ...process.env };
  beforeEach(() => {
    resetIceServerCache();
    for (const k of ['CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN', 'TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL']) delete process.env[k];
  });
  afterEach(() => { process.env = { ...env }; });

  it('is STUN only when no relay is configured', async () => {
    const servers = await iceServers(vi.fn() as never);
    expect(servers).toHaveLength(1);
    expect(turnDiagnostics().provider).toBe('none');
  });

  it('adds a static TURN server from the environment', async () => {
    Object.assign(process.env, { TURN_URLS: 'turn:a:3478, turns:a:443?transport=tcp', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' });
    const servers = await iceServers(vi.fn() as never);
    expect(servers[1]).toEqual({ urls: ['turn:a:3478', 'turns:a:443?transport=tcp'], username: 'u', credential: 'p' });
  });

  it('gets Cloudflare credentials once, drops port 53, and caches them', async () => {
    Object.assign(process.env, { CLOUDFLARE_TURN_KEY_ID: 'kid', CLOUDFLARE_TURN_API_TOKEN: 'tok' });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp'], username: 'cu', credential: 'cc' },
        ],
      }),
    });
    const first = await iceServers(fetchImpl as never);
    await iceServers(fetchImpl as never);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/turn/keys/kid/credentials/generate-ice-servers');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(JSON.stringify(first)).not.toContain(':53');
    expect(first[2]).toEqual({ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'cu', credential: 'cc' });
  });

  it('falls back to STUN and records why when Cloudflare refuses', async () => {
    Object.assign(process.env, { CLOUDFLARE_TURN_KEY_ID: 'kid', CLOUDFLARE_TURN_API_TOKEN: 'bad' });
    const servers = await iceServers(vi.fn().mockResolvedValue({ ok: false, status: 401 }) as never);
    expect(servers).toHaveLength(1);
    expect(turnDiagnostics().last_error?.message).toContain('401');
  });
});
