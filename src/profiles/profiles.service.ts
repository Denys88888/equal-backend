import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';
import { PushService } from '../users/push.service';

@Injectable()
export class ProfilesService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
    private push: PushService,
  ) {}

  async getProfile(userId: string) {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  /** Great-circle distance in km. */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async discover(userId: string, filters: Record<string, string>) {
    const excludeIds = [userId];
    const [alreadySwiped, blockedMe, myProfile] = await Promise.all([
      this.prisma.swipeAction.findMany({ where: { userId }, select: { targetId: true } }),
      // People who blocked me must not surface in my deck either
      this.prisma.swipeAction.findMany({
        where: { targetId: userId, action: 'block' },
        select: { userId: true },
      }),
      this.prisma.profile.findUnique({
        where: { userId },
        select: { interests: true, latitude: true, longitude: true, gender: true, lookingFor: true },
      }),
    ]);
    excludeIds.push(...alreadySwiped.map((s: { targetId: string }) => s.targetId));
    excludeIds.push(...blockedMe.map((s: { userId: string }) => s.userId));

    const myInterests = new Set(myProfile?.interests ?? []);
    const norm = (s: string) => s.trim().toLowerCase();
    const OPEN = 'everyone';
    // gender is stored singular ("woman"), lookingFor plural ("women") — both must
    // collapse to one token or nothing ever matches. Also tolerates legacy values.
    const canon = (raw: string): string => {
      const s = norm(raw);
      if (['woman', 'women', 'female', 'f'].includes(s)) return 'woman';
      if (['man', 'men', 'male', 'm'].includes(s)) return 'man';
      if (['nonbinary', 'non-binary', 'nb', 'enby'].includes(s)) return 'nonbinary';
      if (['everyone', 'all', 'any', 'both'].includes(s)) return OPEN;
      return s;
    };
    const myGender = myProfile?.gender ? canon(myProfile.gender) : null;
    const mySeeking = (myProfile?.lookingFor ?? []).map(canon).filter(Boolean);
    const iAmOpen = mySeeking.length === 0 || mySeeking.includes(OPEN);

    // Age range -> birthDate window (older age == earlier birthDate)
    const ageMin = filters.ageMin ? parseInt(filters.ageMin, 10) : NaN;
    const ageMax = filters.ageMax ? parseInt(filters.ageMax, 10) : NaN;
    const birthDateFilter: { gte?: Date; lte?: Date } = {};
    if (!isNaN(ageMax)) birthDateFilter.gte = new Date(Date.now() - (ageMax + 1) * 31536000000);
    if (!isNaN(ageMin)) birthDateFilter.lte = new Date(Date.now() - ageMin * 31536000000);

    const wantedInterests = filters.interests
      ? filters.interests.split(',').map(norm).filter(Boolean)
      : [];

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        isActive: true,
        ...(filters.verifiedOnly === 'true' ? { verified: true } : {}),
        ...(Object.keys(birthDateFilter).length
          ? { profile: { birthDate: birthDateFilter } }
          : {}),
      },
      // Over-fetch: mutual-preference and distance narrowing happen in JS below.
      take: 100,
      include: { profile: true, photos: { orderBy: { order: 'asc' } } },
    });

    const maxDistance = filters.maxDistance ? parseInt(filters.maxDistance, 10) : NaN;

    const profiles = candidates.filter((user: any) => {
      const theirGender = user.profile?.gender ? canon(user.profile.gender) : null;
      const theirSeeking = (user.profile?.lookingFor ?? []).map(canon).filter(Boolean);
      const theyAreOpen = theirSeeking.length === 0 || theirSeeking.includes(OPEN);

      // Do they match what I'm looking for? (skip when either side hasn't said)
      if (!iAmOpen && theirGender && !mySeeking.includes(theirGender)) return false;
      // Do I match what they're looking for? Mutual, so nobody sees an impossible match.
      if (!theyAreOpen && myGender && !theirSeeking.includes(myGender)) return false;

      if (wantedInterests.length) {
        const theirs = (user.profile?.interests ?? []).map(norm);
        if (!wantedInterests.some((i) => theirs.includes(i))) return false;
      }

      if (!isNaN(maxDistance) && myProfile?.latitude != null && myProfile?.longitude != null
          && user.profile?.latitude != null && user.profile?.longitude != null) {
        if (this.haversine(myProfile.latitude, myProfile.longitude, user.profile.latitude, user.profile.longitude) > maxDistance) {
          return false;
        }
      }
      return true;
    }).slice(0, 20);

    return profiles.map((user: any) => {
      // Jaccard similarity: |intersection| / |union| * 100
      const theirInterests: string[] = user.profile?.interests ?? [];
      const intersection = theirInterests.filter((i: string) => myInterests.has(i)).length;
      const union = new Set([...myInterests, ...theirInterests]).size;
      const compatibility = union > 0 ? Math.round((intersection / union) * 100) : 50;

      // Real distance if both have coordinates, else null
      const distance =
        myProfile?.latitude != null && myProfile?.longitude != null &&
        user.profile?.latitude != null && user.profile?.longitude != null
          ? Math.round(this.haversine(myProfile.latitude, myProfile.longitude, user.profile.latitude, user.profile.longitude))
          : null;

      return {
        id: user.id,
        name: user.name,
        age: user.profile?.birthDate
          ? Math.floor((Date.now() - new Date(user.profile.birthDate).getTime()) / 31536000000)
          : null,
        distance,
        compatibility,
        photo: user.photos[0]?.url || '',
        photos: user.photos.map((p: { url: string }) => p.url),
        bio: user.profile?.bio || '',
        interests: user.profile?.interests || [],
        verified: user.verified ?? false,
        activeNow: this.gateway.isOnline(user.id),
        isNew: false,
      };
    });
  }

  /**
   * A single public profile — for the club "Meet [author/member]" buttons,
   * which had nowhere to send the user: no screen anywhere in the app could
   * show another person's profile except your own swipe deck.
   */
  async getPublicProfile(viewerId: string, handle: string) {
    // In-app taps pass a user id; shared /u/:username links pass a username.
    // Resolving both here keeps every caller below working with a real id.
    const resolved = await this.prisma.user.findFirst({
      // Username folded to be case-insensitive: shared /u/ links are typed by
      // hand and the owner's handle is capitalised ("Cherry19899").
      where: {
        OR: [{ id: handle }, { username: { equals: handle, mode: 'insensitive' } }],
        isActive: true,
      },
      select: { id: true },
    });
    if (!resolved) throw new NotFoundException('Profile not found');
    const targetId = resolved.id;

    if (viewerId === targetId) throw new BadRequestException('Cannot view your own profile this way');

    const blocked = await this.prisma.swipeAction.findFirst({
      where: {
        action: 'block',
        OR: [
          { userId: viewerId, targetId },
          { userId: targetId, targetId: viewerId },
        ],
      },
    });
    if (blocked) throw new NotFoundException('Profile not found');

    const [target, myProfile, myMatches, myLike] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId, isActive: true },
        include: { profile: true, photos: { orderBy: { order: 'asc' } } },
      }),
      this.prisma.profile.findUnique({ where: { userId: viewerId }, select: { interests: true } }),
      this.prisma.match.findFirst({
        where: { OR: [{ user1Id: viewerId, user2Id: targetId }, { user1Id: targetId, user2Id: viewerId }] },
        select: { id: true },
      }),
      this.prisma.swipeAction.findUnique({ where: { userId_targetId: { userId: viewerId, targetId } } }),
    ]);
    if (!target) throw new NotFoundException('Profile not found');

    const myInterests = new Set(myProfile?.interests ?? []);
    const theirInterests: string[] = target.profile?.interests ?? [];
    const intersection = theirInterests.filter((i) => myInterests.has(i)).length;
    const union = new Set([...myInterests, ...theirInterests]).size;
    const compatibility = union > 0 ? Math.round((intersection / union) * 100) : 50;

    return {
      id: target.id,
      name: target.name,
      age: target.profile?.birthDate
        ? Math.floor((Date.now() - new Date(target.profile.birthDate).getTime()) / 31536000000)
        : null,
      compatibility,
      photo: target.photos[0]?.url || '',
      photos: target.photos.map((p) => p.url),
      bio: target.profile?.bio || '',
      interests: theirInterests,
      verified: target.verified ?? false,
      activeNow: this.gateway.isOnline(target.id),
      isMatch: !!myMatches,
      matchId: myMatches?.id ?? null,
      alreadyLiked: myLike ? ['like', 'spark'].includes(myLike.action) : false,
    };
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    const ALLOWED = ['bio', 'birthDate', 'city', 'latitude', 'longitude', 'gender', 'lookingFor', 'goals', 'interests'];
    const profileData: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in data) profileData[key] = data[key];
    }
    // Prisma DateTime rejects bare "YYYY-MM-DD" strings from <input type="date">
    if (typeof profileData.birthDate === 'string') {
      const d = new Date(profileData.birthDate);
      if (isNaN(d.getTime())) delete profileData.birthDate;
      else profileData.birthDate = d;
    }
    // Store gender/lookingFor lowercase so matching never depends on client casing
    if (typeof profileData.gender === 'string') {
      profileData.gender = profileData.gender.trim().toLowerCase();
    }
    if (Array.isArray(profileData.lookingFor)) {
      profileData.lookingFor = (profileData.lookingFor as string[])
        .map((g) => String(g).trim().toLowerCase())
        .filter(Boolean);
    }

    const saved = await this.prisma.profile.upsert({
      where: { userId },
      update: profileData,
      create: { userId, ...profileData },
    });

    // Recompute completeness so the profile_complete reward has something to verify
    const photoCount = await this.prisma.photo.count({ where: { userId } });
    const checks = [
      !!saved.bio,
      !!saved.birthDate,
      !!saved.city,
      !!saved.gender,
      saved.interests.length >= 3,
      saved.goals.length > 0,
      photoCount > 0,
    ];
    const completionPercent = Math.round((checks.filter(Boolean).length / checks.length) * 100);
    return this.prisma.profile.update({
      where: { userId },
      data: { completionPercent, profileComplete: completionPercent === 100 },
    });
  }

  async swipe(userId: string, targetUserId: string, action: string) {
    if (userId === targetUserId) throw new BadRequestException('Cannot swipe on yourself');

    // Sparks are consumed here and nowhere else — the client used to call
    // /sparks/spend separately, which both double-charged and let a tampered
    // client super-like on an empty balance.
    let sparkBalance: number | undefined;
    if (action === 'spark') {
      const consumed = await this.prisma.user.updateMany({
        where: { id: userId, sparkBalance: { gte: 1 } },
        data: { sparkBalance: { decrement: 1 } },
      });
      if (consumed.count === 0) throw new BadRequestException('Not enough sparks');
      const fresh = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { sparkBalance: true },
      });
      sparkBalance = fresh?.sparkBalance ?? 0;
    }

    await this.prisma.swipeAction.upsert({
      where: { userId_targetId: { userId, targetId: targetUserId } },
      update: { action },
      create: { userId, targetId: targetUserId, action },
    });

    return this.resolveMatch(userId, targetUserId, action, sparkBalance);
  }

  /**
   * Undo the most recent swipe. Refunds a spark if that swipe spent one, and
   * removes any match the swipe created so the pair can be shown again.
   */
  async undoLastSwipe(userId: string) {
    const last = await this.prisma.swipeAction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) throw new BadRequestException('Nothing to undo');
    if (last.action === 'block') throw new BadRequestException('Cannot undo a block');

    // If the swipe produced a match that has since been talked in, undoing would
    // cascade-delete the whole conversation — for both people. Refuse instead.
    const [u1, u2] = [userId, last.targetId].sort();
    const match = await this.prisma.match.findFirst({
      where: { user1Id: u1, user2Id: u2 },
      select: { id: true, _count: { select: { messages: true } } },
    });
    if (match && match._count.messages > 0) {
      throw new BadRequestException('Cannot undo — this match already has messages');
    }

    await this.prisma.swipeAction.delete({ where: { id: last.id } });
    if (match) await this.prisma.match.delete({ where: { id: match.id } });

    let sparkBalance: number | undefined;
    if (last.action === 'spark') {
      const refunded = await this.prisma.user.update({
        where: { id: userId },
        data: { sparkBalance: { increment: 1 } },
        select: { sparkBalance: true },
      });
      sparkBalance = refunded.sparkBalance;
    }

    return { success: true, targetId: last.targetId, sparkBalance };
  }

  private async resolveMatch(
    userId: string,
    targetUserId: string,
    action: string,
    sparkBalance?: number,
  ) {
    if (action === 'like' || action === 'spark') {
      const theyLikedUs = await this.prisma.swipeAction.findFirst({
        where: { userId: targetUserId, targetId: userId, action: { in: ['like', 'spark'] } },
      });
      if (theyLikedUs) {
        const [u1, u2] = [userId, targetUserId].sort();
        const existing = await this.prisma.match.findFirst({ where: { user1Id: u1, user2Id: u2 } });
        if (!existing) {
          const match = await this.prisma.match.create({ data: { user1Id: u1, user2Id: u2 } });

          // Real-time socket notification
          this.gateway.server?.to(`user:${targetUserId}`).emit('match:new', { matchId: match.id, withUserId: userId });
          this.gateway.server?.to(`user:${userId}`).emit('match:new', { matchId: match.id, withUserId: targetUserId });

          // Push notification (fire-and-forget)
          const swiper = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
          this.push.sendToUser(targetUserId, {
            title: "It's a Match! 💜",
            body: `You and ${swiper?.name || 'Someone'} liked each other!`,
            url: `/#/matches`,
            tag: `match-${match.id}`,
          }).catch(() => {});

          return { success: true, isMatch: true, matchId: match.id, sparkBalance };
        }
        return { success: true, isMatch: true, matchId: existing.id, sparkBalance };
      }
    }
    return { success: true, isMatch: false, sparkBalance };
  }
}
