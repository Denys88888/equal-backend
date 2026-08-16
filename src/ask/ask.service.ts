import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfanityService } from '../common/profanity.service';
import { PushService } from '../users/push.service';

/**
 * Equal Ask — public Q&A on a profile.
 *
 * Pricing lives here, never on the client: the browser asks for a quote, pays
 * that amount through the normal /payments flow, and this service re-derives
 * the price at submit time and refuses anything short. A client that lies about
 * `isUrgent` just gets rejected rather than getting a free upgrade.
 */

/** Memo every Ask surcharge payment carries. Matched exactly when consuming. */
const ASK_MEMO = 'Equal Ask';

/** Surcharges in Pi. The daily free question is the only zero-cost path. */
const PRICE_EXTRA = 0.1;
const PRICE_URGENT = 0.2;
const PRICE_ANONYMOUS = 0.05;

/** Floating-point slack so 0.30000000000000004 still covers a 0.3 quote. */
const PRICE_EPSILON = 1e-6;

/** Sparks credited to the profile owner for answering a question. */
const ANSWER_REWARD_SPARKS = 1;

/** Reports that count toward an auto-ban, and how long the ban lasts. */
const AUTOBAN_THRESHOLD = 3;
const AUTOBAN_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTOBAN_DURATION_MS = 24 * 60 * 60 * 1000;

const PAGE_SIZE = 20;

/** Shape returned for a publicly visible Q&A card. */
export interface PublicAsk {
  id: string;
  content: string;
  answer: string | null;
  isAnonymous: boolean;
  isUrgent: boolean;
  likes: number;
  likedByMe: boolean;
  createdAt: Date;
  answeredAt: Date | null;
  asker: { id: string; name: string; avatar: string } | null;
}

@Injectable()
export class AskService {
  constructor(
    private prisma: PrismaService,
    private profanity: ProfanityService,
    private push: PushService,
  ) {}

  // ── Pricing ───────────────────────────────────────────

  /** Start of the current UTC day — the boundary the free question resets on. */
  private startOfToday(): Date {
    return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  }

  /**
   * What this specific question costs this specific asker right now.
   * Called both by the quote endpoint and again at submit time.
   */
  private async priceFor(
    askerId: string,
    targetId: string,
    opts: { isAnonymous: boolean; isUrgent: boolean },
  ): Promise<{ price: number; usedFreeToday: boolean; breakdown: Record<string, number> }> {
    const askedToday = await this.prisma.askQuestion.count({
      where: { askerId, targetId, createdAt: { gte: this.startOfToday() } },
    });

    const breakdown: Record<string, number> = {};
    if (askedToday > 0) breakdown.extra = PRICE_EXTRA;
    if (opts.isUrgent) breakdown.urgent = PRICE_URGENT;
    if (opts.isAnonymous) breakdown.anonymous = PRICE_ANONYMOUS;

    const price = Object.values(breakdown).reduce((a, b) => a + b, 0);
    // Sum of 0.1/0.2/0.05 in binary floating point needs rounding before it is
    // compared against what the user actually paid.
    return {
      price: Math.round(price * 100) / 100,
      usedFreeToday: askedToday > 0,
      breakdown,
    };
  }

  async quote(
    askerId: string,
    targetId: string,
    opts: { isAnonymous: boolean; isUrgent: boolean },
  ) {
    const { price, usedFreeToday, breakdown } = await this.priceFor(askerId, targetId, opts);
    return { price, memo: ASK_MEMO, usedFreeToday, breakdown, free: price === 0 };
  }

  /**
   * Burns one COMPLETED, not-yet-consumed Ask payment worth at least `price`.
   *
   * The conditional updateMany is what makes this safe under concurrency: two
   * simultaneous submissions race on `consumedAt: null` and exactly one wins,
   * so a single payment can never buy two questions.
   */
  private async consumePayment(userId: string, price: number): Promise<void> {
    if (price <= 0) return;

    const candidates = await this.prisma.payment.findMany({
      where: { userId, status: 'COMPLETED', memo: ASK_MEMO, consumedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true },
    });

    const usable = candidates.find((p) => p.amount >= price - PRICE_EPSILON);
    if (!usable) {
      throw new BadRequestException(
        `This question costs ${price} Pi — no completed payment found. Pay first, then send.`,
      );
    }

    const burned = await this.prisma.payment.updateMany({
      where: { id: usable.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (burned.count === 0) {
      throw new BadRequestException('That payment was already used. Please pay again.');
    }
  }

  // ── Reads ─────────────────────────────────────────────

  private toPublic(
    q: {
      id: string;
      content: string;
      answer: string | null;
      isAnonymous: boolean;
      isUrgent: boolean;
      likes: number;
      createdAt: Date;
      answeredAt: Date | null;
      asker: { id: string; name: string; photos: { url: string }[] } | null;
      likedBy?: { id: string }[];
    },
    viewerId?: string,
  ): PublicAsk {
    return {
      id: q.id,
      content: q.content,
      answer: q.answer,
      isAnonymous: q.isAnonymous,
      isUrgent: q.isUrgent,
      likes: q.likes,
      likedByMe: !!viewerId && !!q.likedBy?.length,
      createdAt: q.createdAt,
      answeredAt: q.answeredAt,
      // Anonymity is enforced on the way out, for everyone including the target.
      asker: q.isAnonymous || !q.asker
        ? null
        : { id: q.asker.id, name: q.asker.name, avatar: q.asker.photos[0]?.url ?? '' },
    };
  }

  /**
   * Public Q&A feed for a profile. Only ANSWERED questions are ever exposed —
   * a pending question is private between asker and target until answered.
   *
   * `viewerId` is optional so shared /u/:username links work signed-out.
   */
  async getPublic(targetId: string, page = 1, viewerId?: string) {
    const target = await this.prisma.user.findFirst({
      where: { OR: [{ id: targetId }, { username: targetId }], isActive: true },
      select: { id: true, name: true, username: true },
    });
    if (!target) throw new NotFoundException('Profile not found');

    const safePage = Math.max(1, page);
    const [rows, answeredCount, totalCount] = await Promise.all([
      this.prisma.askQuestion.findMany({
        where: { targetId: target.id, status: 'ANSWERED' },
        orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          asker: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
          likedBy: viewerId ? { where: { userId: viewerId }, select: { id: true } } : false,
        },
      }),
      this.prisma.askQuestion.count({ where: { targetId: target.id, status: 'ANSWERED' } }),
      this.prisma.askQuestion.count({
        where: { targetId: target.id, status: { in: ['ANSWERED', 'PENDING'] } },
      }),
    ]);

    return {
      target: { id: target.id, name: target.name, username: target.username },
      questions: rows.map((q) => this.toPublic(q, viewerId)),
      answeredCount,
      totalCount,
      page: safePage,
      hasMore: safePage * PAGE_SIZE < answeredCount,
    };
  }

  /** Questions waiting for me to answer. Urgent first — that is what was paid for. */
  async getInbox(userId: string) {
    const rows = await this.prisma.askQuestion.findMany({
      where: { targetId: userId, status: 'PENDING' },
      orderBy: [{ isUrgent: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        asker: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
      },
    });
    return rows.map((q) => this.toPublic(q));
  }

  /** My own answered Q&A, for the "Answered" tab and share links. */
  async getAnswered(userId: string) {
    const rows = await this.prisma.askQuestion.findMany({
      where: { targetId: userId, status: 'ANSWERED' },
      orderBy: { answeredAt: 'desc' },
      take: 100,
      include: {
        asker: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
      },
    });
    return rows.map((q) => this.toPublic(q));
  }

  /** Questions I sent, so the asker can see whether they were answered. */
  async getSent(userId: string) {
    const rows = await this.prisma.askQuestion.findMany({
      where: { askerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        target: { select: { id: true, name: true, username: true, photos: { where: { isMain: true }, take: 1 } } },
      },
    });
    return rows.map((q) => ({
      id: q.id,
      content: q.content,
      answer: q.answer,
      status: q.status,
      isAnonymous: q.isAnonymous,
      isUrgent: q.isUrgent,
      likes: q.likes,
      createdAt: q.createdAt,
      answeredAt: q.answeredAt,
      target: {
        id: q.target.id,
        name: q.target.name,
        username: q.target.username,
        avatar: q.target.photos[0]?.url ?? '',
      },
    }));
  }

  // ── Writes ────────────────────────────────────────────

  async create(
    askerId: string,
    targetIdOrUsername: string,
    dto: { content: string; isAnonymous?: boolean; isUrgent?: boolean },
  ) {
    const target = await this.prisma.user.findFirst({
      where: { OR: [{ id: targetIdOrUsername }, { username: targetIdOrUsername }], isActive: true },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Profile not found');
    if (target.id === askerId) throw new BadRequestException('You cannot ask yourself a question');

    // A block in either direction hides the profile everywhere else; asking
    // around it would be a way to keep messaging someone who blocked you.
    const blocked = await this.prisma.swipeAction.findFirst({
      where: {
        action: 'block',
        OR: [
          { userId: askerId, targetId: target.id },
          { userId: target.id, targetId: askerId },
        ],
      },
    });
    if (blocked) throw new NotFoundException('Profile not found');

    const content = dto.content.trim();
    if (this.profanity.isProfane(content)) {
      throw new BadRequestException('Please rephrase your question without offensive language');
    }

    const isAnonymous = !!dto.isAnonymous;
    const isUrgent = !!dto.isUrgent;

    const { price } = await this.priceFor(askerId, target.id, { isAnonymous, isUrgent });
    await this.consumePayment(askerId, price);

    const question = await this.prisma.askQuestion.create({
      data: {
        askerId,
        targetId: target.id,
        content: this.profanity.clean(content),
        isAnonymous,
        isUrgent,
        status: 'PENDING',
      },
    });

    // Best effort: a dead push subscription must not fail the question.
    this.push
      .sendToUser(target.id, {
        title: 'New question! 💜',
        body: 'Someone wants to know you better',
        // Hash-prefixed: the client is a HashRouter, so a bare path would land
        // on the server's index instead of the route.
        url: '/#/my-asks',
        tag: `ask-${question.id}`,
      })
      .catch(() => {});

    return { id: question.id, status: question.status, createdAt: question.createdAt };
  }

  async answer(userId: string, questionId: string, answerText: string) {
    const question = await this.prisma.askQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, targetId: true, askerId: true, status: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.targetId !== userId) {
      throw new ForbiddenException('Only the person asked can answer this');
    }
    if (question.status === 'ANSWERED') {
      throw new BadRequestException('This question is already answered');
    }
    if (question.status === 'REPORTED') {
      throw new BadRequestException('This question is under review');
    }

    const clean = this.profanity.clean(answerText.trim());

    // Conditional on status so two taps on "Answer" can't both pay the reward.
    const updated = await this.prisma.askQuestion.updateMany({
      where: { id: questionId, status: { in: ['PENDING', 'REJECTED'] } },
      data: { answer: clean, answeredAt: new Date(), status: 'ANSWERED' },
    });
    if (updated.count === 0) {
      throw new BadRequestException('This question is already answered');
    }

    await this.creditAnswerReward(userId, questionId);

    if (question.askerId) {
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, username: true },
      });
      this.push
        .sendToUser(question.askerId, {
          title: 'Your question got an answer! 🎉',
          body: `${me?.name ?? 'Someone'} replied to your question`,
          url: me?.username ? `/#/u/${encodeURIComponent(me.username)}` : '/#/my-asks',
          tag: `ask-answer-${questionId}`,
        })
        .catch(() => {});
    }

    return { id: questionId, status: 'ANSWERED', answer: clean };
  }

  /**
   * Pays the profile owner for answering. Written through the SparkEarn ledger
   * with a per-question dedupeKey so the unique index — not a read-then-write
   * check — is what stops a double credit.
   */
  private async creditAnswerReward(userId: string, questionId: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.sparkEarn.create({
          data: {
            userId,
            action: 'ask_answer',
            amount: ANSWER_REWARD_SPARKS,
            dedupeKey: `${userId}:ask_answer:${questionId}`,
          },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { sparkBalance: { increment: ANSWER_REWARD_SPARKS } },
        }),
      ]);
    } catch (e) {
      // P2002 == already credited for this question. Anything else is a real
      // fault, but the answer itself is already saved, so never fail the request.
      if ((e as { code?: string }).code !== 'P2002') {
        console.error('[ask] reward credit failed', e);
      }
    }
  }

  async reject(userId: string, questionId: string) {
    const question = await this.prisma.askQuestion.findUnique({
      where: { id: questionId },
      select: { targetId: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.targetId !== userId) {
      throw new ForbiddenException('Only the person asked can reject this');
    }

    await this.prisma.askQuestion.update({
      where: { id: questionId },
      data: { status: 'REJECTED' },
    });
    return { id: questionId, status: 'REJECTED' };
  }

  /**
   * Likes an answered Q&A. The AskLike unique index is the replay guard, so the
   * counter increments exactly once per user even under concurrent taps.
   */
  async like(userId: string, questionId: string) {
    const question = await this.prisma.askQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, askerId: true, status: true, likes: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.status !== 'ANSWERED') {
      throw new BadRequestException('Only answered questions can be liked');
    }
    if (question.askerId === userId) {
      throw new BadRequestException('You cannot like your own question');
    }

    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.askLike.create({ data: { questionId, userId } }),
        this.prisma.askQuestion.update({
          where: { id: questionId },
          data: { likes: { increment: 1 } },
          select: { likes: true },
        }),
      ]);
      return { id: questionId, likes: updated.likes, likedByMe: true };
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        // Already liked — undo it, so the same tap toggles off.
        const [, updated] = await this.prisma.$transaction([
          this.prisma.askLike.delete({ where: { questionId_userId: { questionId, userId } } }),
          this.prisma.askQuestion.update({
            where: { id: questionId },
            data: { likes: { decrement: 1 } },
            select: { likes: true },
          }),
        ]);
        return { id: questionId, likes: Math.max(0, updated.likes), likedByMe: false };
      }
      throw e;
    }
  }

  /**
   * Reports a question. Three distinct reporters inside 24h auto-ban the asker,
   * mirroring the user-report rule — counting DISTINCT reporters is what stops
   * one person banning someone by filing the same report three times.
   */
  async report(userId: string, questionId: string, reason?: string) {
    const question = await this.prisma.askQuestion.findUnique({
      where: { id: questionId },
      select: { id: true, askerId: true, targetId: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    if (question.targetId !== userId && question.askerId !== userId) {
      // Anyone can see a public answer, but only the two parties can report it,
      // otherwise a stranger could bury a profile's Q&A at will.
      throw new ForbiddenException('Only the people involved can report this');
    }

    await this.prisma.askQuestion.update({
      where: { id: questionId },
      data: { status: 'REPORTED' },
    });

    if (!question.askerId) return { success: true, autoBanned: false };

    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetId: question.askerId,
        reason: reason || 'ask_question',
        description: `Equal Ask question ${questionId}`,
      },
    });

    const since = new Date(Date.now() - AUTOBAN_WINDOW_MS);
    const recent = await this.prisma.report.findMany({
      where: { targetId: question.askerId, createdAt: { gte: since } },
      select: { reporterId: true },
      distinct: ['reporterId'],
    });

    if (recent.length >= AUTOBAN_THRESHOLD) {
      await this.prisma.user.update({
        where: { id: question.askerId },
        data: { bannedUntil: new Date(Date.now() + AUTOBAN_DURATION_MS) },
      });
      return { success: true, autoBanned: true };
    }

    return { success: true, autoBanned: false };
  }
}
