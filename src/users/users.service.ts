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
    const { profile, ...rawUserData } = data;

    // Only allow whitelisted fields to prevent role/trustScore manipulation
    const userData: Record<string, unknown> = {};
    for (const key of ALLOWED_USER_FIELDS) {
      if (key in rawUserData) userData[key] = rawUserData[key];
    }

    if (profile && typeof profile === 'object') {
      const profileData: Record<string, unknown> = {};
      for (const key of ALLOWED_PROFILE_FIELDS) {
        if (key in (profile as Record<string, unknown>)) {
          profileData[key] = (profile as Record<string, unknown>)[key];
        }
      }
      await this.prisma.profile.upsert({
        where: { userId: id },
        update: profileData,
        create: { userId: id, ...profileData },
      });
    }

    if (Object.keys(userData).length === 0 && !profile) return this.findById(id);
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
    return this.prisma.photo.delete({ where: { id: photoId } });
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
