import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async getOne(eventId: string) {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: { _count: { select: { rsvps: true } } },
    });
  }

  async getAll() {
    return this.prisma.event.findMany({
      orderBy: { date: 'asc' },
      include: { _count: { select: { rsvps: true } } },
    });
  }

  async rsvp(eventId: string, userId: string, status: string) {
    const normalizedStatus = status.toUpperCase() as any;
    return this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: normalizedStatus },
      create: { eventId, userId, status: normalizedStatus },
    });
  }
}
