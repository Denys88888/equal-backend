import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private prisma: PrismaService) {}

  async getOne(clubId: string) {
    return this.prisma.club.findUnique({
      where: { id: clubId },
      include: { _count: { select: { members: true, posts: true } } },
    });
  }

  async leave(clubId: string, userId: string) {
    return this.prisma.clubMember.deleteMany({ where: { clubId, userId } });
  }

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
    const posts = await this.prisma.clubPost.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: {
          select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } },
        },
      },
    });
    return posts.map((p) => ({
      id: p.id,
      clubId: p.clubId,
      authorId: p.authorId,
      authorName: p.author.name,
      authorAvatar: p.author.photos[0]?.url ?? '',
      content: p.content,
      createdAt: p.createdAt,
    }));
  }

  async createPost(clubId: string, authorId: string, content: string) {
    return this.prisma.clubPost.create({
      data: { clubId, authorId, content },
    });
  }
}
