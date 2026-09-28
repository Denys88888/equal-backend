import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './events.dto';

/** How many of a user's events may wait for review at once — a cap on spam, not on activity. */
export const MAX_PENDING_EVENTS_PER_USER = 3;

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Attach the caller's own RSVP status. Without this the client has no way to
   * know what it already booked: the Events screen started every session with
   * an empty "going" set, so after a reload a paid ticket looked unbought and
   * the Buy button came back — offering to charge for it a second time.
   */
  private withMyRsvp<T extends { rsvps?: { status: string }[] }>(event: T) {
    const { rsvps, ...rest } = event;
    return { ...rest, myRsvpStatus: rsvps?.[0]?.status ?? null };
  }

  async getOne(eventId: string, userId?: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        _count: { select: { rsvps: true } },
        ...(userId ? { rsvps: { where: { userId }, select: { status: true } } } : {}),
      },
    });
    if (!event) return event;
    // An unapproved event exists only for its author until an admin approves it.
    if (event.status !== 'ACTIVE' && event.createdBy !== userId) return null;
    return this.withMyRsvp(event);
  }

  async getAll(userId?: string) {
    const events = await this.prisma.event.findMany({
      // Same rule as clubs: approved events for everyone, plus the caller's own
      // pending ones so they can see what they submitted is waiting.
      where: userId ? { OR: [{ status: 'ACTIVE' }, { createdBy: userId }] } : { status: 'ACTIVE' },
      orderBy: { date: 'asc' },
      include: {
        _count: { select: { rsvps: true } },
        ...(userId ? { rsvps: { where: { userId }, select: { status: true } } } : {}),
      },
    });
    return events.map((e) => this.withMyRsvp(e));
  }

  async rsvp(eventId: string, userId: string, status: string) {
    const normalizedStatus = status.toUpperCase() as 'GOING' | 'INTERESTED' | 'NOT_GOING';
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { price: true, maxAttendees: true, status: true, _count: { select: { rsvps: true } } },
    });
    // A pending event is invisible, so it must also be unbookable — otherwise its
    // id alone would let people RSVP to something an admin never approved.
    if (!event || event.status !== 'ACTIVE') throw new NotFoundException('Event not found');

    if (normalizedStatus === 'GOING') {
      // Capacity — the UI advertises maxAttendees but nothing enforced it
      if (event.maxAttendees != null) {
        const existing = await this.prisma.eventRsvp.findUnique({
          where: { eventId_userId: { eventId, userId } },
          select: { status: true },
        });
        const going = await this.prisma.eventRsvp.count({
          where: { eventId, status: 'GOING' },
        });
        if (existing?.status !== 'GOING' && going >= event.maxAttendees) {
          throw new BadRequestException('Event is full');
        }
      }

      // Paid events: the price was displayed in the UI but RSVP never charged,
      // so every paid event was effectively free. Require a completed Pi payment.
      if (event.price > 0) {
        const paid = await this.prisma.payment.findFirst({
          where: { userId, eventId, status: 'COMPLETED' },
          select: { id: true },
        });
        if (!paid) throw new BadRequestException('Payment required for this event');
      }
    }

    const rsvp = await this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status: normalizedStatus },
      create: { eventId, userId, status: normalizedStatus },
    });

    // attendeeCount is a denormalised column that nothing kept in sync
    const goingCount = await this.prisma.eventRsvp.count({ where: { eventId, status: 'GOING' } });
    await this.prisma.event.update({ where: { id: eventId }, data: { attendeeCount: goingCount } });

    return rsvp;
  }

  /**
   * A user proposes an event. It is created PENDING and free: price is set only
   * by an admin (ticket Pi is paid to the app, not the organiser), and nothing
   * here reads price/status/featured — CreateEventDto does not carry them.
   */
  async create(dto: CreateEventDto, userId: string) {
    const when = new Date(dto.date);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new BadRequestException('Event date must be in the future');
    }

    const pending = await this.prisma.event.count({ where: { createdBy: userId, status: 'PENDING' } });
    if (pending >= MAX_PENDING_EVENTS_PER_USER) {
      throw new BadRequestException(
        `You already have ${MAX_PENDING_EVENTS_PER_USER} events waiting for review`,
      );
    }

    return this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        date: when,
        location: dto.location.trim(),
        city: dto.city.trim(),
        category: dto.category,
        maxAttendees: dto.maxAttendees ?? null,
        price: 0,
        status: 'PENDING',
        createdBy: userId,
      },
    });
  }
}
