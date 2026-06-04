import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Profile, Photo } from '@prisma/client';

export interface UpsertProfileInput {
  bio?: string;
  birthDate?: Date | string;
  city?: string;
  latitude?: number;
  longitude?: number;
  gender?: string;
  lookingFor?: string[];
  goals?: string[];
  interests?: string[];
}

export interface ProfileWithPhotos extends Profile {
  photos: Photo[];
}

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  private calculateCompletionPercent(profile: Profile): number {
    const fields: (keyof Profile)[] = [
      'bio',
      'birthDate',
      'city',
      'gender',
      'lookingFor',
      'goals',
      'interests',
    ];

    let filledCount: number = 0;

    for (const field of fields) {
      const value: unknown = profile[field];
      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length > 0) {
          filledCount++;
        } else if (!Array.isArray(value)) {
          filledCount++;
        }
      }
    }

    const percent: number = Math.round((filledCount / fields.length) * 100);
    return percent;
  }

  async getProfile(userId: string): Promise<ProfileWithPhotos | null> {
    const profile: Profile | null = await this.prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    const photos: Photo[] = await this.prisma.photo.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });

    return { ...profile, photos };
  }

  async upsertProfile(
    userId: string,
    data: UpsertProfileInput,
  ): Promise<Profile> {
    const birthDate: Date | undefined = data.birthDate
      ? new Date(data.birthDate)
      : undefined;

    const existing: Profile | null = await this.prisma.profile.findUnique({
      where: { userId },
    });

    const updatedProfile: Profile = existing
      ? await this.prisma.profile.update({
          where: { userId },
          data: {
            ...data,
            birthDate,
          },
        })
      : await this.prisma.profile.create({
          data: {
            userId,
            ...data,
            birthDate,
          },
        });

    const completionPercent: number = this.calculateCompletionPercent(updatedProfile);
    const profileComplete: boolean = completionPercent >= 80;

    return this.prisma.profile.update({
      where: { userId },
      data: {
        completionPercent,
        profileComplete,
      },
    });
  }

  async addPhoto(userId: string, url: string): Promise<Photo> {
    const existingPhotosCount: number = await this.prisma.photo.count({
      where: { userId },
    });

    const isMain: boolean = existingPhotosCount === 0;

    return this.prisma.photo.create({
      data: {
        userId,
        url,
        isMain,
        order: existingPhotosCount,
      },
    });
  }

  async setMainPhoto(userId: string, photoId: string): Promise<Photo> {
    const photo: Photo | null = await this.prisma.photo.findFirst({
      where: { id: photoId, userId },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    await this.prisma.photo.updateMany({
      where: { userId },
      data: { isMain: false },
    });

    return this.prisma.photo.update({
      where: { id: photoId },
      data: { isMain: true },
    });
  }

  async deletePhoto(userId: string, photoId: string): Promise<Photo> {
    const photo: Photo | null = await this.prisma.photo.findFirst({
      where: { id: photoId, userId },
    });

    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    const deletedPhoto: Photo = await this.prisma.photo.delete({
      where: { id: photoId },
    });

    // If deleted photo was main, set the oldest remaining photo as main
    if (photo.isMain) {
      const remainingPhoto: Photo | null = await this.prisma.photo.findFirst({
        where: { userId },
        orderBy: { order: 'asc' },
      });

      if (remainingPhoto) {
        await this.prisma.photo.update({
          where: { id: remainingPhoto.id },
          data: { isMain: true },
        });
      }
    }

    return deletedPhoto;
  }
}
