import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventsService, MAX_PENDING_EVENTS_PER_USER } from './events.service';

/**
 * Ticketing tests.
 *
 * A paid event is the one place in this app where a wrong answer either lets
 * someone in for free or charges them for a seat that does not exist, so the
 * payment gate, the capacity gate and the RSVP status the client reads back are
 * all covered here.
 */

type PrismaMock = {
  event: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  eventRsvp: {
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  payment: { findFirst: ReturnType<typeof vi.fn> };
};

function makePrisma(): PrismaMock {
  return {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data: unknown }) => Promise.resolve({ id: 'new', ...(args.data as object) })),
    },
    eventRsvp: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      upsert: vi.fn().mockResolvedValue({ id: 'r1', status: 'GOING' }),
    },
    payment: { findFirst: vi.fn() },
  };
}

describe('EventsService — paid-ticket gate', () => {
  let service: EventsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as never);
  });

  it('404s for an event that does not exist', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.rsvp('nope', 'user-1', 'going')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });

  it('refuses a GOING RSVP on a paid event with no completed payment', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 5, maxAttendees: null, _count: { rsvps: 0 } });
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(service.rsvp('e1', 'user-1', 'going')).rejects.toBeInstanceOf(BadRequestException);
    // No seat may be handed out before the money clears.
    expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });

  it('accepts a GOING RSVP once a completed payment exists for that event', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 5, maxAttendees: null, _count: { rsvps: 0 } });
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1' });

    await service.rsvp('e1', 'user-1', 'going');

    // The payment has to be this user's, for this event, and actually completed
    // — a PENDING row must never open the door.
    expect(prisma.payment.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      eventId: 'e1',
      status: 'COMPLETED',
    });
    expect(prisma.eventRsvp.upsert).toHaveBeenCalled();
  });

  it('does not ask for payment on a free event', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: null, _count: { rsvps: 0 } });

    await service.rsvp('e1', 'user-1', 'going');

    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventRsvp.upsert).toHaveBeenCalled();
  });

  it('does not ask for payment to merely mark interest in a paid event', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 5, maxAttendees: null, _count: { rsvps: 0 } });

    await service.rsvp('e1', 'user-1', 'interested');

    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventRsvp.upsert).toHaveBeenCalled();
  });

  it('lets someone withdraw from a paid event without paying again', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 5, maxAttendees: 10, _count: { rsvps: 3 } });

    await service.rsvp('e1', 'user-1', 'not_going');

    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventRsvp.upsert.mock.calls[0][0].update).toEqual({ status: 'NOT_GOING' });
  });

  it('uppercases the client-supplied status before storing it', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: null, _count: { rsvps: 0 } });

    await service.rsvp('e1', 'user-1', 'going');

    const call = prisma.eventRsvp.upsert.mock.calls[0][0];
    expect(call.create.status).toBe('GOING');
    expect(call.update.status).toBe('GOING');
  });
});

describe('EventsService — capacity', () => {
  let service: EventsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as never);
  });

  it('refuses a new attendee once the event is full', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: 10, _count: { rsvps: 10 } });
    prisma.eventRsvp.findUnique.mockResolvedValue(null);
    prisma.eventRsvp.count.mockResolvedValue(10);

    await expect(service.rsvp('e1', 'user-1', 'going')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });

  it('still lets an existing attendee re-confirm a full event', async () => {
    // They already hold one of those seats — re-sending GOING must not evict them.
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: 10, _count: { rsvps: 10 } });
    prisma.eventRsvp.findUnique.mockResolvedValue({ status: 'GOING' });
    prisma.eventRsvp.count.mockResolvedValue(10);

    await expect(service.rsvp('e1', 'user-1', 'going')).resolves.toBeDefined();
    expect(prisma.eventRsvp.upsert).toHaveBeenCalled();
  });

  it('counts only GOING rows against capacity, not interest', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: 10, _count: { rsvps: 40 } });
    prisma.eventRsvp.count.mockResolvedValue(2);

    await service.rsvp('e1', 'user-1', 'going');

    expect(prisma.eventRsvp.count.mock.calls[0][0].where).toEqual({ eventId: 'e1', status: 'GOING' });
  });

  it('applies no cap when the event declares none', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: null, _count: { rsvps: 9999 } });

    await expect(service.rsvp('e1', 'user-1', 'going')).resolves.toBeDefined();
  });

  it('rewrites the denormalised attendeeCount from the real GOING count', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', price: 0, maxAttendees: null, _count: { rsvps: 0 } });
    prisma.eventRsvp.count.mockResolvedValue(7);

    await service.rsvp('e1', 'user-1', 'going');

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { attendeeCount: 7 },
    });
  });
});

describe('EventsService — reading back my own RSVP', () => {
  let service: EventsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as never);
  });

  it('reports the caller their own status so a paid ticket survives a reload', async () => {
    prisma.event.findMany.mockResolvedValue([
      { id: 'e1', title: 'Paid', rsvps: [{ status: 'GOING' }] },
      { id: 'e2', title: 'Saved', rsvps: [{ status: 'INTERESTED' }] },
      { id: 'e3', title: 'Untouched', rsvps: [] },
    ]);

    const events = await service.getAll('user-1');

    expect(events.map((e) => (e as { myRsvpStatus: string | null }).myRsvpStatus))
      .toEqual(['GOING', 'INTERESTED', null]);
  });

  it('never leaks the raw rsvps relation to the client', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1', rsvps: [{ status: 'GOING' }] }]);

    const [event] = await service.getAll('user-1');

    expect(event).not.toHaveProperty('rsvps');
    expect(event).toHaveProperty('myRsvpStatus', 'GOING');
  });

  it('scopes the RSVP lookup to the caller alone', async () => {
    prisma.event.findMany.mockResolvedValue([]);

    await service.getAll('user-1');

    expect(prisma.event.findMany.mock.calls[0][0].include.rsvps).toEqual({
      where: { userId: 'user-1' },
      select: { status: true },
    });
  });

  it('stays usable signed-out, with no status and no per-user query', async () => {
    prisma.event.findMany.mockResolvedValue([{ id: 'e1' }]);

    const [event] = await service.getAll();

    expect((event as { myRsvpStatus: string | null }).myRsvpStatus).toBeNull();
    expect(prisma.event.findMany.mock.calls[0][0].include.rsvps).toBeUndefined();
  });

  it('returns null rather than throwing for a missing single event', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(service.getOne('nope', 'user-1')).resolves.toBeNull();
  });

  it('attaches the status on a single event too', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'e1', status: 'ACTIVE', rsvps: [{ status: 'GOING' }] });

    const event = await service.getOne('e1', 'user-1');

    expect(event).toMatchObject({ id: 'e1', myRsvpStatus: 'GOING' });
    expect(event).not.toHaveProperty('rsvps');
  });
});

describe('EventsService — events proposed by users', () => {
  let service: EventsService;
  let prisma: PrismaMock;
  const inAWeek = () => new Date(Date.now() + 7 * 86400000).toISOString();
  const dto = () => ({
    title: '  Board games night  ',
    description: 'Bring a friend',
    date: inAWeek(),
    location: 'Cafe Nero',
    city: 'Warsaw',
    category: 'Parties',
  });

  beforeEach(() => {
    prisma = makePrisma();
    service = new EventsService(prisma as never);
  });

  it('creates the event PENDING, free and owned by the caller', async () => {
    await service.create(dto(), 'user-1');

    const data = prisma.event.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'PENDING', price: 0, createdBy: 'user-1', title: 'Board games night' });
  });

  it('refuses an event in the past', async () => {
    await expect(
      service.create({ ...dto(), date: new Date(Date.now() - 3600000).toISOString() }, 'user-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it(`caps a user at ${MAX_PENDING_EVENTS_PER_USER} events waiting for review`, async () => {
    prisma.event.count.mockResolvedValue(MAX_PENDING_EVENTS_PER_USER);

    await expect(service.create(dto(), 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.event.count.mock.calls[0][0].where).toEqual({ createdBy: 'user-1', status: 'PENDING' });
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('lists only approved events to a signed-out visitor', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    await service.getAll();
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE' });
  });

  it('lists approved events plus the caller\'s own pending ones', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    await service.getAll('user-1');
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ status: 'ACTIVE' }, { createdBy: 'user-1' }],
    });
  });

  it('hides a pending event from anyone but its author', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'e1', status: 'PENDING', createdBy: 'author' });

    expect(await service.getOne('e1', 'someone-else')).toBeNull();
    expect(await service.getOne('e1')).toBeNull();
  });

  it('shows a pending event to its author', async () => {
    prisma.event.findUnique.mockResolvedValue({ id: 'e1', status: 'PENDING', createdBy: 'author', rsvps: [] });

    expect(await service.getOne('e1', 'author')).toMatchObject({ id: 'e1', status: 'PENDING' });
  });

  it('refuses an RSVP to an event an admin has not approved', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'PENDING', price: 0, maxAttendees: null, _count: { rsvps: 0 } });

    await expect(service.rsvp('e1', 'user-1', 'going')).rejects.toThrow(NotFoundException);
    expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });
});
