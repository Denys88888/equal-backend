import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Event, RsvpStatus, Prisma } from '@prisma/client';

interface EventWithRsvpCounts extends Event {
  rsvpCounts: Record<RsvpStatus, number>;
}

interface CreateEventInput {
  title: string;
  description?: string;
  date: Date;
  location?: string;
  city?: string;
  category?: string;
  price?: number;
  maxAttendees?: number;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    city?: string,
    category?: string,
    upcoming?: boolean,
  ): Promise<Event[]> {
    const where: Prisma.EventWhereInput = {};

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
    }

    if (upcoming === true) {
      where.date = { gte: new Date() };
    } else if (upcoming === false) {
      where.date = { lt: new Date() };
    }

    return this.prisma.event.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  async findById(id: string): Promise<EventWithRsvpCounts | null> {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        rsvps: true,
      },
    });

    if (!event) {
      return null;
    }

    const rsvpCounts: Record<RsvpStatus, number> = {
      GOING: 0,
      INTERESTED: 0,
      NOT_GOING: 0,
    };

    for (const rsvp of event.rsvps) {
      rsvpCounts[rsvp.status] = (rsvpCounts[rsvp.status] || 0) + 1;
    }

    return {
      ...event,
      rsvpCounts,
    };
  }

  async create(data: CreateEventInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  async rsvp(
    eventId: string,
    userId: string,
    status: RsvpStatus,
  ): Promise<void> {
    const event: Event | null = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    await this.prisma.eventRsvp.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      update: { status },
      create: { eventId, userId, status },
    });
  }

  async cancelRsvp(eventId: string, userId: string): Promise<void> {
    const event: Event | null = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const existing = await this.prisma.eventRsvp.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });
    if (!existing) {
      throw new NotFoundException('No RSVP found for this event');
    }

    await this.prisma.eventRsvp.delete({
      where: { id: existing.id },
    });
  }
}
