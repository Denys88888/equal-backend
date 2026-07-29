import { Injectable } from '@nestjs/common';
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
    const OPEN = new Set(['everyone', 'all', 'any']);
    const myGender = myProfile?.gender ? norm(myProfile.gender) : null;
    const mySeeking = (myProfile?.lookingFor ?? []).map(norm).filter(Boolean);
    const iAmOpen = mySeeking.length === 0 || mySeeking.some((g) => OPEN.has(g));

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
      const theirGender = user.profile?.gender ? norm(user.profile.gender) : null;
      const theirSeeking = (user.profile?.lookingFor ?? []).map(norm).filter(Boolean);
      const theyAreOpen = theirSeeking.length === 0 || theirSeeking.some((g: string) => OPEN.has(g));

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
        activeNow: false,
        isNew: false,
      };
    });
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
    await this.prisma.swipeAction.upsert({
      where: { userId_targetId: { userId, targetId: targetUserId } },
      update: { action },
      create: { userId, targetId: targetUserId, action },
    });

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

          return { success: true, isMatch: true, matchId: match.id };
        }
        return { success: true, isMatch: true, matchId: existing.id };
      }
    }
    return { success: true, isMatch: false };
  }
}
