import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    return this.prisma.club.findMany({
      include: { _count: { select: { members: true, posts: true } } },
    });
  }

  async create(data: { name: string; description?: string; category: string }) {
    return this.prisma.club.create({ data });
  }

  async join(clubId: string, userId: string) {
    return this.prisma.clubMember.create({
      data: { clubId, userId },
    });
  }

  async getPosts(clubId: string) {
    return this.prisma.clubPost.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async createPost(clubId: string, authorId: string, content: string) {
    return this.prisma.clubPost.create({
      data: { clubId, authorId, content },
    });
  }
}
