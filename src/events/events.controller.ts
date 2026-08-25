import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { EventsService } from './events.service';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // Optional auth: the listing stays public, but a signed-in caller also gets
  // back their own myRsvpStatus so the client can restore what they booked.
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async getEvents(@Request() req: { user?: { id: string } }) {
    return this.eventsService.getAll(req.user?.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getEvent(@Request() req: { user?: { id: string } }, @Param('id') eventId: string) {
    return this.eventsService.getOne(eventId, req.user?.id);
  }

  @Post(':id/rsvp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async rsvp(
    @Request() req: { user: { id: string } },
    @Param('id') eventId: string,
    @Body() body: { status: string },
  ) {
    return this.eventsService.rsvp(eventId, req.user.id, body.status);
  }
}
