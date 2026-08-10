import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../users/push.service';
import { ProfanityService } from '../common/profanity.service';
import { LoggerService } from '../common/logger.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { isDue, localDayStart, intersect, genderCompatible } from './daily-match.util';

/** How long a fresh Daily Match conversation stays open. */
const CHAT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Pairs are not repeated inside this window. */
const REPEAT_COOLDOWN_DAYS = 30;
/** Total icebreaker questions available (keys q1..q30 resolved client-side). */
const ICEBREAKER_COUNT = 30;

type Candidate = {
  id: string;
  name: string;
  verified: boolean;
  trustScore: number;
  languages: string[];
  dailyVibe: string | null;
  gender: string | null;
  lookingFor: string[];
  interests: string[];
};

@Injectable()
export class DailyMatchService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private profanity: ProfanityService,
    private logger: LoggerService,
    private gateway: ChatGateway,
  ) {}

  // ── Matching ──────────────────────────────────────────

  /**
   * Runs every 15 minutes. Picks up everyone whose local delivery time just
   * came round, pairs them, and leaves the unpaired on the waiting list.
   */
  async runMatching(now = new Date()): Promise<{ created: number; waiting: number }> {
    const eligible = await this.loadEligibleUsers();
    const due = eligible.filter((u) => isDue(now, u.timezone, u.dailyMatchTime));

    // Anyone who has been waiting since an earlier run gets another shot in
    // this one, even though their own time slot has passed.
    const waitingIds = await this.prisma.waitingList.findMany({
      where: { processed: false },
      select: { userId: true },
    });
    const waitingSet = new Set(waitingIds.map((w) => w.userId));
    const retry = eligible.filter((u) => waitingSet.has(u.id) && !due.some((d) => d.id === u.id));

    const pool = [...due, ...retry];
    if (pool.length < 2) {
      this.logger.info('daily-match: not enough users due', { due: pool.length });
      return { created: 0, waiting: pool.length };
    }

    const recentPairs = await this.loadRecentPairs();
    const paired = new Set<string>();
    let created = 0;

    // Verified users are paired first so they preferentially meet each other;
    // whoever is left over still gets matched rather than being dropped.
    const ordered = [...pool].sort((a, b) => Number(b.verified) - Number(a.verified));

    for (const user of ordered) {
      if (paired.has(user.id)) continue;

      const candidates = ordered.filter(
        (other) =>
          other.id !== user.id &&
          !paired.has(other.id) &&
          intersect(user.languages, other.languages).length > 0 &&
          genderCompatible(user.gender, user.lookingFor, other.gender, other.lookingFor) &&
          !recentPairs.has(this.pairKey(user.id, other.id)),
      );
      if (candidates.length === 0) continue;

      const best = candidates
        .map((c) => ({ c, score: this.score(user, c) }))
        .sort((x, y) => y.score - x.score)[0];

      await this.createMatch(user.id, best.c.id, now);
      paired.add(user.id);
      paired.add(best.c.id);
      created++;
    }

    const unpaired = pool.filter((u) => !paired.has(u.id));
    await this.prisma.waitingList.updateMany({
      where: { userId: { in: [...paired] }, processed: false },
      data: { processed: true },
    });
    for (const u of unpaired) {
      const existing = await this.prisma.waitingList.findFirst({
        where: { userId: u.id, processed: false },
      });
      if (!existing) {
        await this.prisma.waitingList.create({ data: { userId: u.id } });
      }
    }

    this.logger.info('daily-match: run complete', { created, waiting: unpaired.length });
    return { created, waiting: unpaired.length };
  }

  /**
   * Everyone who *could* be matched right now: active, not banned, and with a
   * Voice Intro recorded (the spec makes it mandatory — a profile without one
   * is inert). Users already holding a live match today are excluded.
   */
  private async loadEligibleUsers() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        voiceIntroUrl: { not: null },
        OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }],
      },
      select: {
        id: true, name: true, verified: true, trustScore: true, languages: true,
        dailyVibe: true, timezone: true, dailyMatchTime: true,
        profile: { select: { gender: true, lookingFor: true, interests: true } },
      },
    });

    const busy = await this.prisma.dailyMatch.findMany({
      where: { status: { in: ['PENDING', 'ACTIVE', 'MUTUAL'] } },
      select: { userAId: true, userBId: true, matchDate: true, userA: { select: { timezone: true } } },
    });

    const busySet = new Set<string>();
    for (const m of busy) {
      // A match created earlier in the same local day still counts as "has one".
      const dayStart = localDayStart(now, m.userA?.timezone || 'UTC');
      if (m.matchDate >= dayStart) {
        busySet.add(m.userAId);
        busySet.add(m.userBId);
      }
    }

    return users
      .filter((u) => !busySet.has(u.id))
      .map<Candidate & { timezone: string; dailyMatchTime: string }>((u) => ({
        id: u.id,
        name: u.name,
        verified: u.verified,
        trustScore: u.trustScore,
        languages: u.languages ?? [],
        dailyVibe: u.dailyVibe,
        timezone: u.timezone,
        dailyMatchTime: u.dailyMatchTime,
        gender: u.profile?.gender ?? null,
        lookingFor: u.profile?.lookingFor ?? [],
        interests: u.profile?.interests ?? [],
      }));
  }

  private pairKey(a: string, b: string) {
    return [a, b].sort().join(':');
  }

  private async loadRecentPairs(): Promise<Set<string>> {
    const since = new Date(Date.now() - REPEAT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    const past = await this.prisma.dailyMatch.findMany({
      where: { matchDate: { gte: since } },
      select: { userAId: true, userBId: true },
    });
    return new Set(past.map((p) => this.pairKey(p.userAId, p.userBId)));
  }

  /** +10 per shared interest, +5 shared language, +reputation/20, +50 same vibe. */
  private score(a: Candidate, b: Candidate): number {
    let score = 0;
    score += intersect(a.interests, b.interests).length * 10;
    if (intersect(a.languages, b.languages).length > 0) score += 5;
    score += Math.round(b.trustScore / 20);
    if (a.dailyVibe && b.dailyVibe && a.dailyVibe === b.dailyVibe) score += 50;
    return score;
  }

  private async createMatch(userAId: string, userBId: string, now: Date) {
    const match = await this.prisma.dailyMatch.create({
      data: {
        userAId,
        userBId,
        matchDate: now,
        status: 'ACTIVE',
        chatExpiresAt: new Date(now.getTime() + CHAT_WINDOW_MS),
        icebreakerKey: `q${Math.floor(Math.random() * ICEBREAKER_COUNT) + 1}`,
      },
    });

    for (const uid of [userAId, userBId]) {
      this.push.sendToUser(uid, {
        title: 'Твой Daily Match готов!',
        body: 'Знакомься — у вас 24 часа',
        url: `/#/daily-match`,
        tag: 'daily-match',
      }).catch(() => {});
    }
    return match;
  }

  /** Paid extra match (0.2 Pi) — bypasses the once-a-day rule. */
  async createExtraMatch(userId: string) {
    const eligible = await this.loadEligibleUsers();
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, verified: true, trustScore: true, languages: true, dailyVibe: true,
        profile: { select: { gender: true, lookingFor: true, interests: true } },
      },
    });
    if (!me) throw new NotFoundException('User not found');

    const self: Candidate = {
      id: me.id, name: me.name, verified: me.verified, trustScore: me.trustScore,
      languages: me.languages ?? [], dailyVibe: me.dailyVibe,
      gender: me.profile?.gender ?? null,
      lookingFor: me.profile?.lookingFor ?? [],
      interests: me.profile?.interests ?? [],
    };

    const recentPairs = await this.loadRecentPairs();
    const candidates = eligible.filter(
      (o) =>
        o.id !== userId &&
        intersect(self.languages, o.languages).length > 0 &&
        genderCompatible(self.gender, self.lookingFor, o.gender, o.lookingFor) &&
        !recentPairs.has(this.pairKey(userId, o.id)),
    );
    if (candidates.length === 0) {
      throw new BadRequestException('No one available right now — try again later');
    }

    const best = candidates
      .map((c) => ({ c, score: this.score(self, c) }))
      .sort((x, y) => y.score - x.score)[0];

    const match = await this.createMatch(userId, best.c.id, new Date());
    return this.getById(match.id, userId);
  }

  // ── Reads ─────────────────────────────────────────────

  /** The caller's current (non-terminal) Daily Match, or null. */
  async getCurrent(userId: string) {
    const match = await this.prisma.dailyMatch.findFirst({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: { in: ['PENDING', 'ACTIVE', 'MUTUAL'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!match) {
      // Surface the most recent terminal match so the UI can show
      // "expired / you skipped — buy an extra match" instead of a blank screen.
      const last = await this.prisma.dailyMatch.findFirst({
        where: {
          OR: [{ userAId: userId }, { userBId: userId }],
          status: { in: ['EXPIRED', 'REJECTED'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      return last ? this.getById(last.id, userId) : null;
    }
    return this.getById(match.id, userId);
  }

  async getById(matchId: string, userId: string) {
    const match = await this.prisma.dailyMatch.findUnique({
      where: { id: matchId },
      include: {
        userA: { select: this.partnerSelect() },
        userB: { select: this.partnerSelect() },
      },
    });
    if (!match) throw new NotFoundException('Match not found');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not your match');
    }

    const isA = match.userAId === userId;
    const partner = isA ? match.userB : match.userA;

    const counts = await this.prisma.dailyMatchMessage.groupBy({
      by: ['senderId'],
      where: { dailyMatchId: matchId, kind: 'TEXT' },
      _count: { _all: true },
    });
    const mySent = counts.find((c) => c.senderId === userId)?._count._all ?? 0;
    const partnerSent = counts.find((c) => c.senderId === partner.id)?._count._all ?? 0;

    return {
      id: match.id,
      status: match.status,
      matchDate: match.matchDate,
      chatExpiresAt: match.chatExpiresAt,
      expiresInMs: Math.max(0, match.chatExpiresAt.getTime() - Date.now()),
      mySentCount: mySent,
      partnerSentCount: partnerSent,
      icebreaker: {
        key: match.icebreakerKey,
        myAnswer: isA ? match.icebreakerAnswerA : match.icebreakerAnswerB,
        partnerAnswer: isA ? match.icebreakerAnswerB : match.icebreakerAnswerA,
        mySkipped: isA ? match.icebreakerSkippedA : match.icebreakerSkippedB,
        partnerSkipped: isA ? match.icebreakerSkippedB : match.icebreakerSkippedA,
        // Answers stay hidden until both sides are in — that is the whole point
        // of the mechanic, so the server never sends the partner's text early.
        revealed:
          (!!match.icebreakerAnswerA || match.icebreakerSkippedA) &&
          (!!match.icebreakerAnswerB || match.icebreakerSkippedB),
      },
      partner: {
        id: partner.id,
        name: partner.name,
        verified: partner.verified,
        reputation: partner.trustScore,
        languages: partner.languages ?? [],
        voiceIntroUrl: partner.voiceIntroUrl,
        avatar: partner.photos[0]?.url ?? '',
        bio: partner.profile?.bio ?? '',
        city: partner.profile?.city ?? '',
        interests: partner.profile?.interests ?? [],
        age: partner.profile?.birthDate ? this.ageFrom(partner.profile.birthDate) : null,
      },
    };
  }

  private partnerSelect() {
    return {
      id: true, name: true, verified: true, trustScore: true, languages: true, voiceIntroUrl: true,
      photos: { where: { isMain: true }, take: 1, select: { url: true } },
      profile: { select: { bio: true, city: true, interests: true, birthDate: true } },
    } as const;
  }

  private ageFrom(birthDate: Date): number {
    const diff = Date.now() - birthDate.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }

  /** Redacted view of the icebreaker: hides the partner's answer pre-reveal. */
  private redactIcebreaker<T extends { icebreaker: { revealed: boolean; partnerAnswer: string | null } }>(payload: T): T {
    if (!payload.icebreaker.revealed) payload.icebreaker.partnerAnswer = null;
    return payload;
  }

  async getMessages(matchId: string, userId: string, page = 1, limit = 50) {
    await this.assertParticipant(matchId, userId);
    const skip = (Math.max(1, page) - 1) * limit;
    const messages = await this.prisma.dailyMatchMessage.findMany({
      where: { dailyMatchId: matchId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, senderId: true, content: true, kind: true, createdAt: true },
    });
    return {
      messages: messages.reverse(),
      hasMore: messages.length === limit,
      page,
    };
  }

  // ── Writes ────────────────────────────────────────────

  private async assertParticipant(matchId: string, userId: string) {
    const match = await this.prisma.dailyMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException('Not your match');
    }
    return match;
  }

  async sendMessage(matchId: string, senderId: string, content: string, kind = 'TEXT') {
    const match = await this.assertParticipant(matchId, senderId);

    if (match.status === 'EXPIRED' || match.status === 'REJECTED') {
      throw new BadRequestException('This match is closed');
    }
    if (match.status !== 'MUTUAL' && match.chatExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This match has expired');
    }
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    if (text.length > 2000) throw new BadRequestException('Message too long');

    const clean = this.profanity.clean(text);
    const message = await this.prisma.dailyMatchMessage.create({
      data: { dailyMatchId: matchId, senderId, content: clean, kind },
    });

    await this.prisma.matchLog.create({
      data: { userId: senderId, dailyMatchId: matchId, action: 'messaged' },
    });

    const recipientId = match.userAId === senderId ? match.userBId : match.userAId;
    this.gateway.server?.to(`daily:${matchId}`).emit('daily:message', {
      id: message.id,
      dailyMatchId: matchId,
      senderId,
      content: clean,
      kind,
      createdAt: message.createdAt.toISOString(),
    });

    const sender = await this.prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
    this.push.sendToUser(recipientId, {
      title: `${sender?.name ?? 'Твой match'} написал(а)`,
      body: clean.length > 80 ? clean.slice(0, 80) + '…' : clean,
      url: '/#/daily-match',
      tag: `daily-${matchId}`,
    }).catch(() => {});

    return message;
  }

  async skip(matchId: string, userId: string) {
    const match = await this.assertParticipant(matchId, userId);
    if (match.status === 'MUTUAL') {
      throw new BadRequestException('This match is already permanent');
    }
    await this.prisma.dailyMatch.update({
      where: { id: matchId },
      data: { status: 'REJECTED' },
    });
    await this.prisma.matchLog.create({
      data: { userId, dailyMatchId: matchId, action: 'rejected' },
    });
    return { success: true };
  }

  async logView(matchId: string, userId: string) {
    await this.assertParticipant(matchId, userId);
    await this.prisma.matchLog.create({
      data: { userId, dailyMatchId: matchId, action: 'viewed' },
    });
    return { success: true };
  }

  // ── Icebreaker ────────────────────────────────────────

  async answerIcebreaker(matchId: string, userId: string, answer: string) {
    const match = await this.assertParticipant(matchId, userId);
    const text = (answer ?? '').trim();
    if (!text) throw new BadRequestException('Answer cannot be empty');
    if (text.length > 500) throw new BadRequestException('Answer too long');

    const clean = this.profanity.clean(text);
    const isA = match.userAId === userId;
    await this.prisma.dailyMatch.update({
      where: { id: matchId },
      data: isA ? { icebreakerAnswerA: clean } : { icebreakerAnswerB: clean },
    });

    const payload = await this.getById(matchId, userId);
    if (payload.icebreaker.revealed) {
      this.gateway.server?.to(`daily:${matchId}`).emit('daily:icebreaker-revealed', { matchId });
    }
    return this.redactIcebreaker(payload);
  }

  async skipIcebreaker(matchId: string, userId: string) {
    const match = await this.assertParticipant(matchId, userId);
    const isA = match.userAId === userId;
    await this.prisma.dailyMatch.update({
      where: { id: matchId },
      data: isA ? { icebreakerSkippedA: true } : { icebreakerSkippedB: true },
    });
    const payload = await this.getById(matchId, userId);
    if (payload.icebreaker.revealed) {
      this.gateway.server?.to(`daily:${matchId}`).emit('daily:icebreaker-revealed', { matchId });
    }
    return this.redactIcebreaker(payload);
  }

  // ── Expiry ────────────────────────────────────────────

  /**
   * Closes out matches whose 24h window elapsed. Both sides having written at
   * least once promotes the match to MUTUAL and opens a permanent Match, so the
   * conversation continues in the normal chat instead of vanishing.
   */
  async processExpired(now = new Date()): Promise<{ mutual: number; expired: number }> {
    const due = await this.prisma.dailyMatch.findMany({
      where: { status: 'ACTIVE', chatExpiresAt: { lt: now } },
      select: { id: true, userAId: true, userBId: true },
    });

    let mutual = 0;
    let expired = 0;

    for (const match of due) {
      const counts = await this.prisma.dailyMatchMessage.groupBy({
        by: ['senderId'],
        where: { dailyMatchId: match.id, kind: 'TEXT' },
        _count: { _all: true },
      });
      const aWrote = (counts.find((c) => c.senderId === match.userAId)?._count._all ?? 0) > 0;
      const bWrote = (counts.find((c) => c.senderId === match.userBId)?._count._all ?? 0) > 0;

      if (aWrote && bWrote) {
        await this.prisma.dailyMatch.update({ where: { id: match.id }, data: { status: 'MUTUAL' } });
        await this.openPermanentMatch(match.userAId, match.userBId);
        mutual++;
        for (const uid of [match.userAId, match.userBId]) {
          this.push.sendToUser(uid, {
            title: '❤️ Match unlocked!',
            body: 'Чат открыт навсегда',
            url: '/#/daily-match',
            tag: 'daily-match',
          }).catch(() => {});
        }
      } else {
        await this.prisma.dailyMatch.update({ where: { id: match.id }, data: { status: 'EXPIRED' } });
        await this.prisma.matchLog.createMany({
          data: [match.userAId, match.userBId].map((userId) => ({
            userId, dailyMatchId: match.id, action: 'expired',
          })),
        });
        expired++;
        for (const uid of [match.userAId, match.userBId]) {
          this.push.sendToUser(uid, {
            title: '💔 Match expired',
            body: 'Новый match завтра',
            url: '/#/daily-match',
            tag: 'daily-match',
          }).catch(() => {});
        }
      }
    }

    if (due.length) this.logger.info('daily-match: expiry processed', { mutual, expired });
    return { mutual, expired };
  }

  /** Idempotent: the pair may already have a regular Match from swiping. */
  private async openPermanentMatch(userAId: string, userBId: string) {
    const [user1Id, user2Id] = [userAId, userBId].sort();
    const existing = await this.prisma.match.findFirst({
      where: {
        OR: [
          { user1Id, user2Id },
          { user1Id: user2Id, user2Id: user1Id },
        ],
      },
    });
    if (existing) return existing;
    return this.prisma.match.create({ data: { user1Id, user2Id } });
  }

  // ── Reminder pushes ───────────────────────────────────

  /** Fired by cron; `offsetMinutes` is relative to the user's match time. */
  async sendReminders(now: Date, offsetMinutes: number, title: string, body: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, voiceIntroUrl: { not: null } },
      select: { id: true, timezone: true, dailyMatchTime: true },
    });

    let sent = 0;
    for (const u of users) {
      const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
      if (!isDue(shifted, u.timezone, u.dailyMatchTime)) continue;
      this.push.sendToUser(u.id, { title, body, url: '/#/daily-match', tag: 'daily-match' }).catch(() => {});
      sent++;
    }
    return sent;
  }

  /** 20:00 nudge for people who have a live match but haven't written. */
  async remindSilent(now = new Date()) {
    const active = await this.prisma.dailyMatch.findMany({
      where: { status: 'ACTIVE', chatExpiresAt: { gt: now } },
      select: { id: true, userAId: true, userBId: true, chatExpiresAt: true },
    });

    let sent = 0;
    for (const match of active) {
      const senders = await this.prisma.dailyMatchMessage.findMany({
        where: { dailyMatchId: match.id },
        select: { senderId: true },
        distinct: ['senderId'],
      });
      const wrote = new Set(senders.map((s) => s.senderId));
      const hoursLeft = Math.max(0, Math.round((match.chatExpiresAt.getTime() - now.getTime()) / 3_600_000));

      for (const uid of [match.userAId, match.userBId]) {
        if (wrote.has(uid)) continue;
        this.push.sendToUser(uid, {
          title: 'Ты ещё не написал(а) своему match',
          body: `Осталось ${hoursLeft} ч.`,
          url: '/#/daily-match',
          tag: 'daily-match',
        }).catch(() => {});
        sent++;
      }
    }
    return sent;
  }
}
