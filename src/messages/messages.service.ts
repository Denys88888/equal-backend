import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../users/push.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  private async verifyParticipant(matchId: string, userId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Match not found');
    if (match.user1Id !== userId && match.user2Id !== userId) {
      throw new ForbiddenException('Not your match');
    }
    return match;
  }

  async getMessages(matchId: string, userId: string, limit = 50) {
    const match = await this.verifyParticipant(matchId, userId);
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
    const [messages, partner, myProfile] = await Promise.all([
      this.prisma.message.findMany({
        where: { matchId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.user.findUnique({
        where: { id: partnerId },
        include: { photos: { orderBy: { order: 'asc' }, take: 1 }, profile: { select: { interests: true } } },
      }),
      this.prisma.profile.findUnique({ where: { userId }, select: { interests: true } }),
    ]);

    const myInterests: string[] = myProfile?.interests ?? [];
    const theirInterests: string[] = partner?.profile?.interests ?? [];
    const sharedInterests = theirInterests.filter((i) => myInterests.includes(i));

    const TEMPLATES: Record<string, string[]> = {
      Hiking: ["Favorite trail you've hiked?", "Best hike you've done so far?"],
      Coffee: ["Best coffee spot in your city?", "Espresso or pour-over?"],
      Music: ["Favorite artist right now?", "Last concert you went to?"],
      Travel: ["Top destination on your list?", "Best trip you've taken?"],
      Photography: ["Film or digital?", "Favorite subject to photograph?"],
      Cooking: ["Signature dish you make?", "Sweet or savory?"],
      Reading: ["Last book you couldn't put down?", "Fiction or non-fiction?"],
      Gaming: ["Favorite game right now?", "Console or PC?"],
      Yoga: ["Morning or evening yoga?", "How long have you practiced?"],
      Dogs: ["Tell me about your dog!", "Favorite dog breed?"],
      Cats: ["How many cats do you have?", "Any funny cat stories?"],
      Fitness: ["Favorite workout?", "Gym or outdoors?"],
      Art: ["Do you create art yourself?", "Favorite art style?"],
      Movies: ["Last movie that blew you away?", "Favorite genre?"],
      Netflix: ["Current show you're binging?", "Best Netflix series ever?"],
    };
    const icebreakers: string[] = [];
    for (const interest of sharedInterests.slice(0, 3)) {
      const tpls = TEMPLATES[interest];
      if (tpls) icebreakers.push(tpls[0]);
    }
    if (icebreakers.length === 0 && partner?.name) {
      icebreakers.push(`Hey ${partner.name}! What's something fun you did recently?`);
    }

    const normalized = messages.reverse().map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      sender: m.senderId === userId ? 'me' : 'them',
      timestamp: m.createdAt,
      read: true,
    }));
    return {
      messages: normalized,
      hasMore: messages.length === limit,
      partnerId,
      matchName: partner?.name || '',
      matchAvatar: partner?.photos[0]?.url || '',
      isOnline: false,
      isVerified: partner?.verified ?? false,
      sharedInterests,
      icebreakers,
    };
  }

  async create(matchId: string, senderId: string, content: string, type = 'TEXT') {
    const match = await this.verifyParticipant(matchId, senderId);
    const msgType = type.toUpperCase() as 'TEXT' | 'VOICE' | 'GIFT' | 'SYSTEM';
    const message = await this.prisma.message.create({
      data: { matchId, senderId, content, type: msgType },
    });

    // Push notification to the other participant
    const recipientId = match.user1Id === senderId ? match.user2Id : match.user1Id;
    const sender = await this.prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
    this.push.sendToUser(recipientId, {
      title: `New message from ${sender?.name || 'Someone'}`,
      body: content.length > 80 ? content.slice(0, 80) + '…' : content,
      url: `/#/chat/${matchId}`,
      tag: `msg-${matchId}`,
    }).catch(() => {});

    return message;
  }
}
