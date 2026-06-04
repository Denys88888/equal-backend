import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from './events.service';
import { Event, RsvpStatus } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

class CreateEventDto {
  title: string;
  description?: string;
  date: string;
  location?: string;
  city?: string;
  category?: string;
  price?: number;
  maxAttendees?: number;
}

class RsvpDto {
  status: RsvpStatus;
}

interface EventWithRsvpCounts extends Event {
  rsvpCounts: Record<RsvpStatus, number>;
}

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async findAll(
    @Query('city') city?: string,
    @Query('category') category?: string,
    @Query('upcoming') upcoming?: string,
  ): Promise<Event[]> {
    const isUpcoming: boolean | undefined =
      upcoming === 'true' ? true : upcoming === 'false' ? false : undefined;
    return this.eventsService.findAll(city, category, isUpcoming);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<EventWithRsvpCounts> {
    const event: EventWithRsvpCounts | null =
      await this.eventsService.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  @Post()
  async create(
    @Body() dto: CreateEventDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Event> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can create events');
    }
    const eventData = {
      ...dto,
      date: new Date(dto.date),
    };
    return this.eventsService.create(eventData);
  }

  @Post(':id/rsvp')
  async rsvp(
    @Param('id') eventId: string,
    @Body() dto: RsvpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.eventsService.rsvp(eventId, req.user.userId, dto.status);
    return { success: true, message: 'RSVP recorded successfully' };
  }

  @Delete(':id/rsvp')
  async cancelRsvp(
    @Param('id') eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.eventsService.cancelRsvp(eventId, req.user.userId);
    return { success: true, message: 'RSVP cancelled successfully' };
  }
}
