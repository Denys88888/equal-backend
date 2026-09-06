import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_USER_FIELDS = ['name', 'avatar'];
const ALLOWED_PROFILE_FIELDS = ['bio', 'birthDate', 'city', 'latitude', 'longitude', 'gender', 'lookingFor', 'goals', 'interests'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, photos: { orderBy: { order: 'asc' } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
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
    return this.prisma.photo.create({
      data: { userId, url, isMain, order: count },
    });
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

  /** Daily Match delivery preferences (timezone, local time, languages). */
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
