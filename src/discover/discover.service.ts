import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Profile, Photo } from '@prisma/client';

export interface DiscoverFilters {
  gender?: string;
  minAge?: number;
  maxAge?: number;
  city?: string;
  page?: number;
  limit?: number;
}

export interface DiscoverProfileDto {
  userId: string;
  name: string;
  avatar: string | null;
  age: number | null;
  bio: string | null;
  city: string | null;
  interests: string[];
  trustScore: number;
  photos: Photo[];
  compatibilityScore: number;
}

@Injectable()
export class DiscoverService {
  constructor(private readonly prisma: PrismaService) {}

  async getDiscoverProfiles(
    userId: string,
    filters: DiscoverFilters,
  ): Promise<{ profiles: DiscoverProfileDto[]; total: number; page: number; limit: number }> {
    const page: number = filters.page ?? 1;
    const limit: number = filters.limit ?? 20;
    const skip: number = (page - 1) * limit;

    // Get IDs of users already swiped by current user
    const swipedActions = await this.prisma.swipeAction.findMany({
      where: { userId },
      select: { targetId: true },
    });
    const swipedUserIds: string[] = swipedActions.map((s) => s.targetId);

    // Build where clause for profile filters
    const profileWhere: {
      userId?: { notIn: string[]; not: string };
      gender?: string;
      city?: { contains: string; mode: 'insensitive' };
      birthDate?: { gte?: Date; lte?: Date };
    } = {
      userId: {
        notIn: [...swipedUserIds, userId],
        not: userId,
      },
    };

    if (filters.gender) {
      profileWhere.gender = filters.gender;
    }

    if (filters.city) {
      profileWhere.city = {
        contains: filters.city,
        mode: 'insensitive',
      };
    }

    if (filters.minAge !== undefined || filters.maxAge !== undefined) {
      const now: number = Date.now();
      profileWhere.birthDate = {};

      if (filters.maxAge !== undefined) {
        // Max age means birthDate >= date X years ago (older = smaller birthDate)
        const maxAgeDate: Date = new Date(
          now - filters.maxAge * 365.25 * 24 * 60 * 60 * 1000,
        );
        profileWhere.birthDate.gte = maxAgeDate;
      }

      if (filters.minAge !== undefined) {
        // Min age means birthDate <= date X years ago (younger = larger birthDate)
        const minAgeDate: Date = new Date(
          now - filters.minAge * 365.25 * 24 * 60 * 60 * 1000,
        );
        profileWhere.birthDate.lte = minAgeDate;
      }
    }

    // Get total count for pagination
    const total: number = await this.prisma.profile.count({
      where: profileWhere,
    });

    // Get current user's profile for interest comparison
    const currentUserProfile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { interests: true },
    });
    const currentUserInterests: string[] = currentUserProfile?.interests ?? [];

    // Fetch profiles with user and photos
    const profiles = (await this.prisma.profile.findMany({
      where: profileWhere,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
          include: {
            photos: { orderBy: { order: 'asc' } },
          },
        },
      },
      skip,
      take: limit,
    })) as Array<
      Profile & {
        user: { id: string; name: string; avatar: string | null; photos: Photo[] };
      }
    >;

    // Calculate age and compatibility score for each profile
    const discoverProfiles: DiscoverProfileDto[] = profiles.map((profile) => {
      const age: number | null = profile.birthDate
        ? Math.floor(
            (Date.now() - new Date(profile.birthDate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;

      const sharedInterestsCount: number = profile.interests.filter((interest: string) =>
        currentUserInterests.includes(interest),
      ).length;

      const compatibilityScore: number =
        sharedInterestsCount * 10 + (profile.trustScore ?? 0) / 10;

      return {
        userId: profile.user.id,
        name: profile.user.name,
        avatar: profile.user.avatar,
        age,
        bio: profile.bio,
        city: profile.city,
        interests: profile.interests,
        trustScore: profile.trustScore,
        photos: profile.user.photos,
        compatibilityScore,
      };
    });

    return {
      profiles: discoverProfiles,
      total,
      page,
      limit,
    };
  }
}
