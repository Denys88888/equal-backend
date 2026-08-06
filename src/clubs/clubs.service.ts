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
      // Pending clubs are only visible to the member who created them until
      // an admin approves — everyone else only sees ACTIVE clubs.
      where: userId ? { OR: [{ status: 'ACTIVE' }, { createdBy: userId }] } : { status: 'ACTIVE' },
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
      status: c.status,
      createdAt: c.createdAt,
    }));
  }

  async create(data: { name: string; description?: string; category: string }, creatorId: string) {
    const club = await this.prisma.club.create({
      data: { ...data, createdBy: creatorId, status: 'PENDING' },
    });
    // Creator auto-joins their own (pending) club as its admin
    await this.prisma.clubMember.create({
      data: { clubId: club.id, userId: creatorId, role: 'ADMIN' },
    });
    return club;
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

  /**
   * Real club roster. The Members tab used to be permanently empty (or "You"
   * only) — there was no endpoint here at all, so a club's actual membership
   * was never fetched.
   */
  async getMembers(clubId: string, requesterId: string) {
    await this.assertMember(clubId, requesterId);
    const members = await this.prisma.clubMember.findMany({
      where: { clubId },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
      },
    });
    return members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatar: m.user.photos[0]?.url ?? '',
      role: m.role.toLowerCase(),
      online: this.gateway.isOnline(m.user.id),
    }));
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
        _count: { select: { likes: true, comments: true } },
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
      image: p.image,
      likes: p._count.likes,
      comments: p._count.comments,
      likedByMe: userId ? p.likes.length > 0 : false,
      createdAt: p.createdAt,
    }));
  }

  async createPost(clubId: string, authorId: string, content: string, image?: string) {
    await this.assertMember(clubId, authorId);
    const trimmed = (content ?? '').trim();
    if (!trimmed && !image) throw new ForbiddenException('Post needs text or a photo');
    return this.prisma.clubPost.create({
      data: { clubId, authorId, content: trimmed, image },
    });
  }

  // ── Post comments ───────────────────────────────────────
  // The comment button on a post had no backend behind it either — it just
  // displayed a static count with nothing to open.

  async getComments(postId: string, userId: string) {
    const post = await this.prisma.clubPost.findUnique({ where: { id: postId }, select: { clubId: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertMember(post.clubId, userId);

    const comments = await this.prisma.clubPostComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        author: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
      },
    });
    return comments.map((c) => ({
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      authorName: c.author.name,
      authorAvatar: c.author.photos[0]?.url ?? '',
      content: c.content,
      createdAt: c.createdAt,
    }));
  }

  async createComment(postId: string, authorId: string, content: string) {
    const post = await this.prisma.clubPost.findUnique({ where: { id: postId }, select: { clubId: true } });
    if (!post) throw new NotFoundException('Post not found');
    await this.assertMember(post.clubId, authorId);

    const trimmed = (content ?? '').trim();
    if (!trimmed) throw new ForbiddenException('Comment cannot be empty');

    const comment = await this.prisma.clubPostComment.create({
      data: { postId, authorId, content: trimmed },
      include: { author: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } } },
    });
    return {
      id: comment.id,
      postId,
      authorId,
      authorName: comment.author.name,
      authorAvatar: comment.author.photos[0]?.url ?? '',
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  /**
   * Delete your own post (or, if isAdmin, anyone's). There was no way to
   * remove a post at all before — not by its author, not by a moderator.
   * Comments and likes cascade via the schema's onDelete: Cascade.
   */
  async deletePost(postId: string, requesterId: string, isAdmin: boolean) {
    const post = await this.prisma.clubPost.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== requesterId && !isAdmin) throw new ForbiddenException('Not your post');
    await this.prisma.clubPost.delete({ where: { id: postId } });
    return { success: true };
  }

  /** Delete your own comment (or, if isAdmin, anyone's). */
  async deleteComment(commentId: string, requesterId: string, isAdmin: boolean) {
    const comment = await this.prisma.clubPostComment.findUnique({ where: { id: commentId }, select: { authorId: true } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== requesterId && !isAdmin) throw new ForbiddenException('Not your comment');
    await this.prisma.clubPostComment.delete({ where: { id: commentId } });
    return { success: true };
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
