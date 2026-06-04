import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Match, Message, Photo } from '@prisma/client';

export interface MatchWithOtherUser {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: Date;
  otherUser: {
    id: string;
    name: string;
    avatar: string | null;
    profile: {
      bio: string | null;
      city: string | null;
      interests: string[];
      trustScore: number;
    } | null;
    photos: Photo[];
  };
}

export interface MatchDetailDto {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: Date;
  messages: Message[];
  otherUser: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMatches(userId: string): Promise<MatchWithOtherUser[]> {
    const matches: Array<
      Match & {
        user1: {
          id: string;
          name: string;
          avatar: string | null;
          profile: { bio: string | null; city: string | null; interests: string[]; trustScore: number } | null;
          photos: Photo[];
        };
        user2: {
          id: string;
          name: string;
          avatar: string | null;
          profile: { bio: string | null; city: string | null; interests: string[]; trustScore: number } | null;
          photos: Photo[];
        };
      }
    > = await this.prisma.match.findMany({
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: {
          select: {
            id: true,
            name: true,
            avatar: true,
            profile: {
              select: {
                bio: true,
                city: true,
                interests: true,
                trustScore: true,
              },
            },
            photos: {
              orderBy: { order: 'asc' },
            },
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            avatar: true,
            profile: {
              select: {
                bio: true,
                city: true,
                interests: true,
                trustScore: true,
              },
            },
            photos: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => {
      const isUser1: boolean = match.user1Id === userId;
      const otherUser = isUser1 ? match.user2 : match.user1;

      return {
        id: match.id,
        user1Id: match.user1Id,
        user2Id: match.user2Id,
        createdAt: match.createdAt,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name,
          avatar: otherUser.avatar,
          profile: otherUser.profile,
          photos: otherUser.photos,
        },
      };
    });
  }

  async findMatchById(matchId: string, userId: string): Promise<MatchDetailDto> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        user1: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        user2: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('You are not part of this match');
    }

    const isUser1: boolean = match.user1Id === userId;
    const otherUser = isUser1 ? match.user2 : match.user1;

    return {
      id: match.id,
      user1Id: match.user1Id,
      user2Id: match.user2Id,
      createdAt: match.createdAt,
      messages: match.messages,
      otherUser: {
        id: otherUser.id,
        name: otherUser.name,
        avatar: otherUser.avatar,
      },
    };
  }

  async deleteMatch(matchId: string, userId: string): Promise<{ deleted: boolean }> {
    const match: Match | null = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('You are not part of this match');
    }

    // Cascade delete happens automatically via Prisma relation
    await this.prisma.match.delete({
      where: { id: matchId },
    });

    return { deleted: true };
  }
}
