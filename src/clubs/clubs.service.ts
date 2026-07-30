import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../gateway/chat.gateway';

@Injectable()
export class ClubsService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
  ) {}

  async getOne(clubId: string) {
    return this.prisma.club.findUnique({
      where: { id: clubId },
      include: { _count: { select: { members: true, posts: true } } },
    });
  }

  async leave(clubId: string, userId: string) {
    return this.prisma.clubMember.deleteMany({ where: { clubId, userId } });
  }

  async getAll(userId?: string) {
    const clubs = await this.prisma.club.findMany({
      include: {
        _count: { select: { members: true, posts: true } },
        ...(userId ? { members: { where: { userId }, select: { id: true } } } : {}),
      },
    });
    return clubs.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      category: c.category,
      icon: c.icon,
      memberCount: c._count.members,
      postCount: c._count.posts,
      isJoined: userId ? c.members.length > 0 : false,
      createdAt: c.createdAt,
    }));
  }

  async create(data: { name: string; description?: string; category: string }) {
    return this.prisma.club.create({ data });
  }

  async join(clubId: string, userId: string) {
    // Idempotent: re-joining shouldn't blow up on the unique constraint
    return this.prisma.clubMember.upsert({
      where: { clubId_userId: { clubId, userId } },
      update: {},
      create: { clubId, userId },
    });
  }

  private async assertMember(clubId: string, userId: string) {
    const member = await this.prisma.clubMember.findUnique({
      where: { clubId_userId: { clubId, userId } },
    });
    if (!member) throw new ForbiddenException('Join the club first');
  }

  async getPosts(clubId: string, userId?: string) {
    const posts = await this.prisma.clubPost.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: {
          select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } },
        },
        _count: { select: { likes: true } },
        ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {}),
      },
    });
    return posts.map((p: any) => ({
      id: p.id,
      clubId: p.clubId,
      authorId: p.authorId,
      authorName: p.author.name,
      authorAvatar: p.author.photos[0]?.url ?? '',
      content: p.content,
      likes: p._count.likes,
      likedByMe: userId ? p.likes.length > 0 : false,
      createdAt: p.createdAt,
    }));
  }

  async createPost(clubId: string, authorId: string, content: string) {
    await this.assertMember(clubId, authorId);
    return this.prisma.clubPost.create({
      data: { clubId, authorId, content },
    });
  }

  /** Toggles this user's like. Returns the resulting count and state. */
  async toggleLike(postId: string, userId: string) {
    const post = await this.prisma.clubPost.findUnique({
      where: { id: postId },
      select: { clubId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertMember(post.clubId, userId);

    const existing = await this.prisma.clubPostLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.clubPostLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.clubPostLike.create({ data: { postId, userId } });
    }
    const likes = await this.prisma.clubPostLike.count({ where: { postId } });
    return { likes, likedByMe: !existing };
  }

  // ── Club chat ───────────────────────────────────────────
  // The Clubs screen kept chat purely in local React state: messages vanished on
  // reload and no other member ever saw them. There was no backend at all.

  async getMessages(clubId: string, userId: string, limit = 50) {
    await this.assertMember(clubId, userId);
    const messages = await this.prisma.clubMessage.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        author: {
          select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } },
        },
      },
    });
    return messages.reverse().map((m) => ({
      id: m.id,
      clubId: m.clubId,
      authorId: m.authorId,
      authorName: m.author.name,
      authorAvatar: m.author.photos[0]?.url ?? '',
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  async createMessage(clubId: string, authorId: string, content: string) {
    await this.assertMember(clubId, authorId);
    const trimmed = (content ?? '').trim();
    if (!trimmed) throw new ForbiddenException('Message cannot be empty');

    const message = await this.prisma.clubMessage.create({
      data: { clubId, authorId, content: trimmed },
      include: {
        author: {
          select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } },
        },
      },
    });

    const payload = {
      id: message.id,
      clubId,
      authorId,
      authorName: message.author.name,
      authorAvatar: message.author.photos[0]?.url ?? '',
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
    this.gateway.server?.to(`club:${clubId}`).emit('club:message', payload);
    return payload;
  }
}
