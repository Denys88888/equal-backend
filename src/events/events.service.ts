import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    return event ? this.withMyRsvp(event) : event;
  }

  async getAll(userId?: string) {
    const events = await this.prisma.event.findMany({
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
      select: { price: true, maxAttendees: true, _count: { select: { rsvps: true } } },
    });
    if (!event) throw new NotFoundException('Event not found');

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
}
