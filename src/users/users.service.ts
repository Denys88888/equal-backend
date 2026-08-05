import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
    if (isMain) {
      await this.prisma.photo.updateMany({ where: { userId }, data: { isMain: false } });
    }
    const count = await this.prisma.photo.count({ where: { userId } });
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

  async reportUser(userId: string, targetId: string, reason: string, description?: string) {
    await this.prisma.report.create({
      data: { reporterId: userId, targetId, reason, description },
    });
    return { success: true };
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
