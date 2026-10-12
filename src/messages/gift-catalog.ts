import type { PrismaService } from '../prisma/prisma.service';

/**
 * Gifts and their prices in Pi. The server's list is the one that counts: the
 * app shows the same prices, but a gift message is only created when a
 * completed payment of at least this much backs it (see
 * PaymentsService.redeemForGift).
 */
export const GIFT_PRICES = {
  spark: 0,
  kiss: 0.5,
  coffee: 1,
  song: 1.5,
  rose: 2,
  heart: 3,
  bouquet: 5,
  diamond: 10,
} as const;

export type GiftKind = keyof typeof GIFT_PRICES;

export const isGiftKind = (v: unknown): v is GiftKind =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(GIFT_PRICES, v);

/** How many of each gift a user has received, for the profile showcase. */
export async function countGiftsReceived(prisma: PrismaService, userId: string): Promise<Partial<Record<GiftKind, number>>> {
  const rows = await prisma.message.groupBy({
    by: ['giftType'],
    where: {
      type: 'GIFT',
      senderId: { not: userId },
      match: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    },
    _count: { _all: true },
  });
  const counts: Partial<Record<GiftKind, number>> = {};
  for (const r of rows) if (isGiftKind(r.giftType)) counts[r.giftType] = r._count._all;
  return counts;
}
