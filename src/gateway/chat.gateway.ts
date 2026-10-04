import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../users/push.service';
import { allowedOrigins } from '../common/allowed-origins';

/** Socket with the identity we resolved from the handshake token. */
type AuthedSocket = Socket & { userId?: string };

@WebSocketGateway({ cors: { origin: allowedOrigins, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  /** userId -> number of live sockets. Multiple tabs/devices count separately. */
  private readonly online = new Map<string, number>();

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  /**
   * The client sends its JWT as handshake auth.token. Previously nothing was
   * verified: join:user took a caller-supplied userId and join:match a
   * caller-supplied matchId, so anyone could sit in a stranger's conversation
   * room and read messages as they were sent.
   */
  async handleConnection(client: AuthedSocket) {
    const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      // No explicit secret: use JwtModule's registered options, which are the
      // same ones used to sign. Passing it separately invites a silent mismatch
      // that would disconnect every client and kill all realtime.
      const payload = await this.jwt.verifyAsync(token);
      const userId = payload?.sub ?? payload?.id ?? payload?.userId;
      if (!userId) throw new Error('token has no subject');
      // This path verifies the token itself and never goes through JwtStrategy,
      // so the suspension check has to be repeated here.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true, bannedUntil: true },
      });
      if (!user?.isActive) throw new Error('account is deactivated');
      if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
        throw new Error('account is temporarily banned');
      }
      client.userId = userId;
      // Own room, so the server can always reach this user without trusting input
      client.join(`user:${userId}`);
      this.markOnline(userId);
    } catch (e) {
      // Logged (without the token) so a broken handshake is diagnosable from
      // Render logs rather than looking like "realtime just stopped working".
      console.warn(`socket auth rejected: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (client.userId) this.markOffline(client.userId);
  }

  // ── Presence ──────────────────────────────────────────

  private markOnline(userId: string) {
    const next = (this.online.get(userId) ?? 0) + 1;
    this.online.set(userId, next);
    if (next === 1) this.broadcastPresence(userId, true);
  }

  private markOffline(userId: string) {
    const next = (this.online.get(userId) ?? 1) - 1;
    if (next <= 0) {
      this.online.delete(userId);
      this.broadcastPresence(userId, false);
    } else {
      this.online.set(userId, next);
    }
  }

  /** Tell this user's matches that their status changed. */
  private async broadcastPresence(userId: string, isOnline: boolean) {
    try {
      const matches = await this.prisma.match.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        select: { user1Id: true, user2Id: true },
      });
      for (const m of matches) {
        const partnerId = m.user1Id === userId ? m.user2Id : m.user1Id;
        this.server?.to(`user:${partnerId}`).emit('presence:update', { userId, isOnline });
      }
    } catch {
      // presence is best-effort; never let it break the connection lifecycle
    }
  }

  isOnline(userId: string): boolean {
    return this.online.has(userId);
  }

  onlineUserIds(): string[] {
    return [...this.online.keys()];
  }

  // ── Rooms ─────────────────────────────────────────────

  @SubscribeMessage('join:match')
  async handleJoinMatch(client: AuthedSocket, matchId: string) {
    if (!client.userId || typeof matchId !== 'string') return { event: 'error' };
    // Membership is checked against the DB — never taken on the client's word
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ user1Id: client.userId }, { user2Id: client.userId }],
      },
      select: { id: true },
    });
    if (!match) return { event: 'error', reason: 'not a participant' };
    client.join(`match:${matchId}`);
    return { event: 'joined', matchId };
  }

  /** Daily Match room — same DB-checked membership rule as join:match. */
  @SubscribeMessage('join:daily')
  async handleJoinDaily(client: AuthedSocket, dailyMatchId: string) {
    if (!client.userId || typeof dailyMatchId !== 'string') return { event: 'error' };
    const match = await this.prisma.dailyMatch.findFirst({
      where: {
        id: dailyMatchId,
        OR: [{ userAId: client.userId }, { userBId: client.userId }],
      },
      select: { id: true },
    });
    if (!match) return { event: 'error', reason: 'not a participant' };
    client.join(`daily:${dailyMatchId}`);
    return { event: 'joined:daily', dailyMatchId };
  }

  /** Kept for backwards compatibility; identity comes from the token, not the payload. */
  @SubscribeMessage('join:user')
  handleJoinUser(client: AuthedSocket) {
    if (!client.userId) return { event: 'error' };
    return { event: 'joined:user', userId: client.userId };
  }

  @SubscribeMessage('join:club')
  async handleJoinClub(client: AuthedSocket, clubId: string) {
    if (!client.userId || typeof clubId !== 'string') return { event: 'error' };
    // Only actual members receive club chat
    const member = await this.prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId: client.userId } },
      select: { id: true },
    });
    if (!member) return { event: 'error', reason: 'not a member' };
    client.join(`club:${clubId}`);
    return { event: 'joined:club', clubId };
  }

  @SubscribeMessage('leave:club')
  handleLeaveClub(client: AuthedSocket, clubId: string) {
    if (typeof clubId === 'string') client.leave(`club:${clubId}`);
  }

  /** True only when the socket has already been admitted to the match room. */
  private inMatch(client: AuthedSocket, matchId: string): boolean {
    return typeof matchId === 'string' && client.rooms.has(`match:${matchId}`);
  }

  // Note: the old 'message:send' handler was removed. It broadcast a
  // caller-supplied senderId without persisting anything, so any client could
  // forge a message from any user. Sending now goes through the REST route,
  // which authenticates, persists, and emits.

  // ── Typing ────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(client: AuthedSocket, payload: { matchId: string }) {
    if (!client.userId || !this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('typing:start', { userId: client.userId });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(client: AuthedSocket, payload: { matchId: string }) {
    if (!client.userId || !this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('typing:stop', { userId: client.userId });
  }

  // ── Video calls ───────────────────────────────────────
  //
  // Every call event goes to the partner's own user room. It used to go to the
  // match room, which only holds people who have that chat open — the person
  // being called almost never does, so the offer went nowhere, nothing rang on
  // their side, and the caller waited on "Connecting..." forever.
  //
  // Flow: caller call:invite → callee sees call:incoming → call:accept →
  // caller sends call:offer → callee call:answer → both trade call:ice.
  // call:cancel (caller gives up), call:decline and call:end close it.

  /** The other participant of a match the socket's user belongs to; cached per socket. */
  private async callPartner(client: AuthedSocket, matchId: unknown): Promise<string | null> {
    if (!client.userId || typeof matchId !== 'string' || matchId.length > 64) return null;
    const data = client.data as { callPartners?: Map<string, string> };
    const cache = (data.callPartners ??= new Map());
    const hit = cache.get(matchId);
    if (hit) return hit;
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, OR: [{ user1Id: client.userId }, { user2Id: client.userId }] },
      select: { user1Id: true, user2Id: true },
    });
    if (!match) return null;
    const partnerId = match.user1Id === client.userId ? match.user2Id : match.user1Id;
    cache.set(matchId, partnerId);
    return partnerId;
  }

  private async relayCall(client: AuthedSocket, matchId: unknown, event: string, extra: Record<string, unknown> = {}) {
    const partnerId = await this.callPartner(client, matchId);
    if (!partnerId) return { ok: false };
    this.server.to(`user:${partnerId}`).emit(event, { matchId, fromUserId: client.userId, ...extra });
    return { ok: true };
  }

  @SubscribeMessage('call:invite')
  async handleCallInvite(client: AuthedSocket, payload: { matchId: string }) {
    const matchId = payload?.matchId;
    const partnerId = await this.callPartner(client, matchId);
    if (!partnerId) return { ok: false, reason: 'not_a_participant' };
    const [caller, partner] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: client.userId },
        select: { name: true, photos: { orderBy: [{ isMain: 'desc' }, { order: 'asc' }], take: 1, select: { url: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: partnerId }, select: { isActive: true, isDemo: true } }),
    ]);
    // A fake profile has nobody behind it to pick up.
    if (!partner?.isActive || partner.isDemo) return { ok: false, reason: 'unavailable' };
    const name = caller?.name ?? '';
    this.server.to(`user:${partnerId}`).emit('call:incoming', {
      matchId,
      fromUserId: client.userId,
      name,
      photo: caller?.photos?.[0]?.url ?? null,
    });
    const online = this.isOnline(partnerId);
    if (!online) {
      // App closed: ring through a push that opens straight into the answer screen.
      this.push
        .sendToUser(partnerId, {
          title: 'call_title',
          body: 'call_body',
          params: { name },
          url: `/#/video/${matchId}?answer=1`,
          tag: `call-${matchId}`,
        })
        .catch(() => {});
    }
    return { ok: true, online };
  }

  @SubscribeMessage('call:cancel')
  handleCallCancel(client: AuthedSocket, payload: { matchId: string }) {
    return this.relayCall(client, payload?.matchId, 'call:cancelled');
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(client: AuthedSocket, payload: { matchId: string }) {
    return this.relayCall(client, payload?.matchId, 'call:accepted');
  }

  @SubscribeMessage('call:decline')
  handleCallDecline(client: AuthedSocket, payload: { matchId: string; reason?: string }) {
    const reason = payload?.reason === 'busy' ? 'busy' : 'declined';
    return this.relayCall(client, payload?.matchId, 'call:declined', { reason });
  }

  @SubscribeMessage('call:offer')
  handleCallOffer(client: AuthedSocket, payload: { matchId: string; offer: RTCSessionDescriptionInit }) {
    if (!isDescription(payload?.offer, 'offer')) return { ok: false };
    return this.relayCall(client, payload.matchId, 'call:offer', { offer: payload.offer });
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(client: AuthedSocket, payload: { matchId: string; answer: RTCSessionDescriptionInit }) {
    if (!isDescription(payload?.answer, 'answer')) return { ok: false };
    return this.relayCall(client, payload.matchId, 'call:answer', { answer: payload.answer });
  }

  @SubscribeMessage('call:ice')
  handleCallIce(client: AuthedSocket, payload: { matchId: string; candidate: RTCIceCandidateInit }) {
    const candidate = payload?.candidate;
    if (!candidate || typeof candidate !== 'object' || JSON.stringify(candidate).length > 2000) return { ok: false };
    return this.relayCall(client, payload.matchId, 'call:ice', { candidate });
  }

  @SubscribeMessage('call:end')
  handleCallEnd(client: AuthedSocket, payload: { matchId: string }) {
    return this.relayCall(client, payload?.matchId, 'call:end');
  }
}

/** An SDP of the expected type and a sane size — relayed as-is to the partner. */
function isDescription(value: unknown, type: 'offer' | 'answer'): value is RTCSessionDescriptionInit {
  const d = value as RTCSessionDescriptionInit | undefined;
  return !!d && d.type === type && typeof d.sdp === 'string' && d.sdp.length > 0 && d.sdp.length <= 20000;
}
