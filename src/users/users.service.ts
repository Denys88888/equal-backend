import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SETTINGS_SELECT, UpdateSettingsDto } from './users.dto';
import { RewardsService } from '../sparks/rewards.service';

const ALLOWED_USER_FIELDS = ['name', 'avatar'];
const ALLOWED_PROFILE_FIELDS = ['bio', 'birthDate', 'city', 'latitude', 'longitude', 'gender', 'lookingFor', 'goals', 'interests'];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private rewards: RewardsService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, photos: { orderBy: { order: 'asc' } } },
    });
    if (!user) throw new NotFoundException('User not found');
    // Server-side plumbing the app never needs: the (unused) password hash and
    // the raw Web Push endpoint + keys.
    const { password: _password, pushSubscription: _push, ...visible } = user;
    return visible;
  }

  async update(id: string, data: Record<string, unknown>) {
    const { profile: nestedProfile, ...rawData } = data;

    // Only allow whitelisted user fields
    const userData: Record<string, unknown> = {};
    for (const key of ALLOWED_USER_FIELDS) {
      if (key in rawData) userData[key] = rawData[key];
    }

    // Accept profile fields nested under "profile" OR at top level
    const profileData: Record<string, unknown> = {};
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (nestedProfile && typeof nestedProfile === 'object' && key in (nestedProfile as Record<string, unknown>)) {
        profileData[key] = (nestedProfile as Record<string, unknown>)[key];
      } else if (key in rawData) {
        profileData[key] = rawData[key];
      }
    }

    // Prisma DateTime rejects bare "YYYY-MM-DD" strings from <input type="date">
    if (typeof profileData.birthDate === 'string') {
      const d = new Date(profileData.birthDate);
      if (isNaN(d.getTime())) delete profileData.birthDate;
      else profileData.birthDate = d;
    }

    if (Object.keys(profileData).length > 0) {
      await this.prisma.profile.upsert({
        where: { userId: id },
        update: profileData,
        create: { userId: id, ...profileData },
      });
      await this.rewards.refreshProfileCompletion(id);
    }

    if (Object.keys(userData).length === 0 && Object.keys(profileData).length === 0) {
      return this.findById(id);
    }
    if (Object.keys(userData).length > 0) {
      await this.prisma.user.update({ where: { id }, data: userData });
    }
    return this.findById(id);
  }

  async addPhoto(userId: string, url: string, isMain: boolean) {
    const count = await this.prisma.photo.count({ where: { userId } });
    // The onboarding UI caps this at 9; nothing enforced it server-side.
    if (count >= 9) throw new ForbiddenException('Photo limit reached (max 9)');
    if (isMain) {
      await this.prisma.photo.updateMany({ where: { userId }, data: { isMain: false } });
    }
    const photo = await this.prisma.photo.create({
      data: { userId, url, isMain, order: count },
    });
    await this.rewards.refreshProfileCompletion(userId);
    return photo;
  }

  async deletePhoto(userId: string, photoId: string) {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.userId !== userId) throw new NotFoundException('Photo not found');
    await this.prisma.photo.delete({ where: { id: photoId } });

    // If the deleted photo was the main one, promote the next by display order —
    // otherwise chat/club avatars (which key off Photo.isMain, not position)
    // go blank even though Discover's photos[0]-by-order would show someone else.
    if (photo.isMain) {
      const next = await this.prisma.photo.findFirst({
        where: { userId },
        orderBy: { order: 'asc' },
      });
      if (next) await this.prisma.photo.update({ where: { id: next.id }, data: { isMain: true } });
    }
    await this.rewards.refreshProfileCompletion(userId);
    return { success: true };
  }

  async deleteUser(id: string) {
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  async blockUser(userId: string, targetId: string) {
    if (userId === targetId) throw new ForbiddenException('Cannot block yourself');
    await this.prisma.swipeAction.upsert({
      where: { userId_targetId: { userId, targetId } },
      update: { action: 'block' },
      create: { userId, targetId, action: 'block' },
    });
    return { success: true };
  }

  /**
   * Blocks are stored as SwipeAction rows with action='block'. Removing the row
   * both unblocks and puts the person back in the deck.
   */
  async unblockUser(userId: string, targetId: string) {
    await this.prisma.swipeAction.deleteMany({
      where: { userId, targetId, action: 'block' },
    });
    return { success: true };
  }

  /** The Settings screen previously showed a hardcoded list of two fake people. */
  async getBlockedUsers(userId: string) {
    const blocks = await this.prisma.swipeAction.findMany({
      where: { userId, action: 'block' },
      orderBy: { createdAt: 'desc' },
    });
    if (blocks.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: blocks.map((b) => b.targetId) } },
      select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      avatar: u.photos[0]?.url ?? '',
    }));
  }

  /** Reports that count toward an auto-ban, and how long the ban lasts. */
  private static readonly AUTOBAN_THRESHOLD = 3;
  private static readonly AUTOBAN_WINDOW_MS = 24 * 60 * 60 * 1000;
  private static readonly AUTOBAN_DURATION_MS = 24 * 60 * 60 * 1000;

  async reportUser(userId: string, targetId: string, reason: string, description?: string) {
    await this.prisma.report.create({
      data: { reporterId: userId, targetId, reason, description },
    });

    // 3 distinct reporters inside 24h → automatic 24h ban. Counting DISTINCT
    // reporters (not raw rows) is what stops one person from banning anyone
    // they dislike by filing the same report three times.
    const since = new Date(Date.now() - UsersService.AUTOBAN_WINDOW_MS);
    const recent = await this.prisma.report.findMany({
      where: { targetId, createdAt: { gte: since } },
      select: { reporterId: true },
      distinct: ['reporterId'],
    });

    if (recent.length >= UsersService.AUTOBAN_THRESHOLD) {
      await this.prisma.user.update({
        where: { id: targetId },
        data: { bannedUntil: new Date(Date.now() + UsersService.AUTOBAN_DURATION_MS) },
      });
      return { success: true, autoBanned: true };
    }

    return { success: true, autoBanned: false };
  }

  /**
   * Voice Intro is required before a profile enters matching, so this is a
   * plain setter on User rather than another Photo-style table.
   */
  async setVoiceIntro(userId: string, url: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { voiceIntroUrl: url } });
    return { voiceIntroUrl: url };
  }

  async deleteVoiceIntro(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { voiceIntroUrl: null } });
    return { success: true };
  }

  async setVideoIntro(userId: string, url: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { videoIntroUrl: url } });
    return { videoIntroUrl: url };
  }

  async deleteVideoIntro(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { videoIntroUrl: null } });
    return { success: true };
  }

  /** Daily Match delivery preferences (timezone, local time, languages). */
  /**
   * Which Profile badges the user has earned, from what they actually did.
   * The badges described automatic goals ("Join 3+ clubs", "Send 50
   * messages", "Attend 2 events"…) but only lit up when an admin happened to
   * award a badge string containing a matching word, so nobody ever earned
   * one by doing the thing.
   */
  async getAchievements(userId: string) {
    const now = new Date();
    const [user, profile, clubs, greatEvents, sparksSent, messages, dailyMessages, attended] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { verified: true, trustScore: true } }),
      this.prisma.profile.findUnique({ where: { userId }, select: { profileComplete: true } }),
      this.prisma.clubMember.count({ where: { userId } }),
      this.prisma.eventFeedback.count({ where: { userId, rating: 'great' } }),
      this.prisma.swipeAction.count({ where: { userId, action: 'spark' } }),
      this.prisma.message.count({ where: { senderId: userId } }),
      this.prisma.dailyMatchMessage.count({ where: { senderId: userId } }),
      this.prisma.eventRsvp.count({ where: { userId, status: 'GOING', event: { date: { lt: now } } } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return {
      verified: user.verified,
      party: clubs >= 3,
      pro: greatEvents >= 3,
      spark: sparksSent >= 10,
      chatty: messages + dailyMessages >= 50,
      event: attended >= 2,
      profile: !!profile?.profileComplete,
      trust: user.trustScore > 80,
    };
  }

  /** Privacy + notification toggles from Settings; returns the saved values. */
  async updateSettings(userId: string, data: UpdateSettingsDto) {
    const patch: Record<string, boolean | string> = {};
    for (const key of Object.keys(SETTINGS_SELECT) as (keyof UpdateSettingsDto)[]) {
      if (typeof data[key] === 'boolean') patch[key] = data[key] as boolean;
    }
    if (typeof data.locale === 'string') patch.locale = data.locale;
    return this.prisma.user.update({
      where: { id: userId },
      data: patch,
      select: { ...SETTINGS_SELECT, locale: true },
    });
  }

  async updateMatchPrefs(
    userId: string,
    data: { timezone?: string; dailyMatchTime?: string; languages?: string[] },
  ) {
    if (data.dailyMatchTime && !/^\d{1,2}:\d{2}$/.test(data.dailyMatchTime)) {
      throw new BadRequestException('dailyMatchTime must be HH:mm');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.dailyMatchTime !== undefined && { dailyMatchTime: data.dailyMatchTime }),
        ...(data.languages !== undefined && { languages: data.languages }),
      },
      select: { timezone: true, dailyMatchTime: true, languages: true, voiceIntroUrl: true },
    });
    return user;
  }

  async reorderPhotos(userId: string, photoIds: string[]) {
    await Promise.all(
      photoIds.map((id, order) =>
        this.prisma.photo.updateMany({ where: { id, userId }, data: { order } }),
      ),
    );
    return this.prisma.photo.findMany({ where: { userId }, orderBy: { order: 'asc' } });
  }
}
