import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async getAll() {
    return this.prisma.event.findMany({
      orderBy: { date: 'asc' },
      include: { _count: { select: { rsvps: true } } },
    });
  }

  async rsvp(eventId: string, userId: string, status: string) {
    return this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: status as any },
      create: { eventId, userId, status: status as any },
    });
  }
}
