import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Profile, Photo } from '@prisma/client';

export interface UserWithRelations extends User {
  profile: Profile | null;
  photos: Photo[];
}

export interface PublicProfile {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  birthDate: Date | null;
  city: string | null;
  gender: string | null;
  lookingFor: string[];
  goals: string[];
  interests: string[];
  trustScore: number;
  completionPercent: number;
  photos: Photo[];
}

export interface UpdateUserInput {
  name?: string;
  avatar?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, photos: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findPublicProfile(userId: string): Promise<PublicProfile> {
    const user: UserWithRelations | null = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, photos: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.profile?.bio ?? null,
      birthDate: user.profile?.birthDate ?? null,
      city: user.profile?.city ?? null,
      gender: user.profile?.gender ?? null,
      lookingFor: user.profile?.lookingFor ?? [],
      goals: user.profile?.goals ?? [],
      interests: user.profile?.interests ?? [],
      trustScore: user.profile?.trustScore ?? 50,
      completionPercent: user.profile?.completionPercent ?? 0,
      photos: user.photos,
    };
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async deactivateUser(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
