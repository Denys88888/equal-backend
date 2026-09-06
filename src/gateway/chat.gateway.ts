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

  // ── WebRTC signaling ──────────────────────────────────

  @SubscribeMessage('call:offer')
  handleCallOffer(client: AuthedSocket, payload: { matchId: string; offer: RTCSessionDescriptionInit }) {
    if (!this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('call:offer', { ...payload, callerId: client.userId });
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(client: AuthedSocket, payload: { matchId: string; answer: RTCSessionDescriptionInit }) {
    if (!this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('call:answer', payload);
  }

  @SubscribeMessage('call:ice')
  handleCallIce(client: AuthedSocket, payload: { matchId: string; candidate: RTCIceCandidateInit }) {
    if (!this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('call:ice', payload);
  }

  @SubscribeMessage('call:end')
  handleCallEnd(client: AuthedSocket, payload: { matchId: string }) {
    if (!this.inMatch(client, payload?.matchId)) return;
    client.to(`match:${payload.matchId}`).emit('call:end', {});
  }
}
