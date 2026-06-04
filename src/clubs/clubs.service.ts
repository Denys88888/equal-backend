import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Club, ClubPost, Prisma } from '@prisma/client';

interface ClubWithRelations extends Club {
  members: Array<{
    id: string;
    role: string;
    joinedAt: Date;
    userId: string;
  }>;
  posts: Array<{
    id: string;
    content: string;
    createdAt: Date;
    authorId: string;
  }>;
}

interface CreateClubInput {
  name: string;
  description?: string;
  category: string;
  icon?: string;
}

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: string, name?: string): Promise<Club[]> {
    const where: Prisma.ClubWhereInput = {};

    if (category) {
      where.category = category;
    }

    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    return this.prisma.club.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string): Promise<ClubWithRelations | null> {
    return this.prisma.club.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            club: false,
          },
          orderBy: { joinedAt: 'asc' },
        },
        posts: {
          orderBy: { createdAt: 'desc' },
        },
      },
    }) as Promise<ClubWithRelations | null>;
  }

  async create(data: CreateClubInput): Promise<Club> {
    return this.prisma.club.create({ data });
  }

  async joinClub(clubId: string, userId: string): Promise<void> {
    const club: Club | null = await this.prisma.club.findUnique({
      where: { id: clubId },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const existing = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });
    if (existing) {
      throw new ConflictException('Already a member of this club');
    }

    await this.prisma.clubMember.create({
      data: { clubId, userId, role: 'MEMBER' },
    });
  }

  async leaveClub(clubId: string, userId: string): Promise<void> {
    const club: Club | null = await this.prisma.club.findUnique({
      where: { id: clubId },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const existing = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });
    if (!existing) {
      throw new NotFoundException('Not a member of this club');
    }

    await this.prisma.clubMember.delete({
      where: { id: existing.id },
    });
  }

  async createPost(
    clubId: string,
    authorId: string,
    content: string,
  ): Promise<ClubPost> {
    const club: Club | null = await this.prisma.club.findUnique({
      where: { id: clubId },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const membership = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId: authorId },
      },
    });
    if (!membership) {
      throw new ConflictException('Must be a club member to post');
    }

    return this.prisma.clubPost.create({
      data: { clubId, authorId, content },
    });
  }
}
