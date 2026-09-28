import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SparksService } from './sparks.service';

/** Trust gained by getting verified (and lost if an admin revokes it). */
export const VERIFIED_TRUST_BONUS = 20;

/**
 * Server-side consequences of things users do.
 *
 * Profile promised "+5 Sparks for verifying, +3 for completing your profile,
 * +1 a day for club activity", and SparksService had the rules — but nothing
 * ever called it: the app never asked, so nobody earned a single spark. The
 * Trust Score card likewise said "Verification +30" while verifying changed
 * nothing. The rewards now happen here, at the moment the thing happens.
 */
@Injectable()
export class RewardsService {
  constructor(
    private prisma: PrismaService,
    private sparks: SparksService,
  ) {}

  /** Grant a spark reward without ever failing the action that earned it. */
  async award(userId: string, action: string) {
    try {
      return await this.sparks.earn(userId, action);
    } catch (e) {
      // Already claimed, daily cap reached, or not eligible yet — all normal.
      if (e instanceof BadRequestException) return null;
      console.error(`[rewards] ${action} failed for ${userId}`, e);
      return null;
    }
  }

  /**
   * Recompute profile completeness from what is stored. It used to be computed
   * only when the profile form was saved, so adding the last missing piece — a
   * photo — never marked the profile complete.
   */
  async refreshProfileCompletion(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) return null;
    const photoCount = await this.prisma.photo.count({ where: { userId } });
    const checks = [
      !!profile.bio,
      !!profile.birthDate,
      !!profile.city,
      !!profile.gender,
      profile.interests.length >= 3,
      profile.goals.length > 0,
      photoCount > 0,
    ];
    const completionPercent = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    const updated = await this.prisma.profile.update({
      where: { userId },
      data: { completionPercent, profileComplete: completionPercent === 100 },
    });
    if (updated.profileComplete) await this.award(userId, 'complete_profile');
    return updated;
  }

  /** Trust and sparks follow verification being granted or revoked. */
  async onVerificationChanged(userId: string, before: boolean, after: boolean) {
    if (before === after) return;
    await this.adjustTrust(userId, after ? VERIFIED_TRUST_BONUS : -VERIFIED_TRUST_BONUS);
    if (after) await this.award(userId, 'verification');
  }

  /** Move trust by `delta`, kept within 0–100, on both User and its Profile mirror. */
  async adjustTrust(userId: string, delta: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { trustScore: true } });
    if (!user) return null;
    const next = Math.max(0, Math.min(100, user.trustScore + delta));
    await this.prisma.user.update({ where: { id: userId }, data: { trustScore: next } });
    await this.prisma.profile.updateMany({ where: { userId }, data: { trustScore: next } });
    return next;
  }
}
