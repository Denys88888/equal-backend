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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
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
  title!: string;
  description?: string;
  date!: string;
  location?: string;
  city?: string;
  category?: string;
  price?: number;
  maxAttendees?: number;
}

class RsvpDto {
  status!: RsvpStatus;
}

interface EventWithRsvpCounts extends Event {
  rsvpCounts: Record<RsvpStatus, number>;
}

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List all events' })
  @ApiQuery({ name: 'city', required: false, description: 'Filter by city' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'upcoming', required: false, description: 'Filter upcoming events' })
  @ApiResponse({ status: 200, description: 'Events retrieved successfully' })
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
  @ApiOperation({ summary: 'Get event by ID' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async findById(@Param('id') id: string): Promise<EventWithRsvpCounts> {
    const event: EventWithRsvpCounts | null =
      await this.eventsService.findById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new event (admin only)' })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
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
  @ApiOperation({ summary: 'RSVP to an event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiBody({ type: RsvpDto })
  @ApiResponse({ status: 201, description: 'RSVP recorded successfully' })
  async rsvp(
    @Param('id') eventId: string,
    @Body() dto: RsvpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.eventsService.rsvp(eventId, req.user.userId, dto.status);
    return { success: true, message: 'RSVP recorded successfully' };
  }

  @Delete(':id/rsvp')
  @ApiOperation({ summary: 'Cancel RSVP to an event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'RSVP cancelled successfully' })
  async cancelRsvp(
    @Param('id') eventId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.eventsService.cancelRsvp(eventId, req.user.userId);
    return { success: true, message: 'RSVP cancelled successfully' };
  }
}
