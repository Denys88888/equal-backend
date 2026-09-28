import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Exactly the categories the Events screen can filter by, so a created event is findable. */
export const EVENT_CATEGORIES = ['Speed Dating', 'Social Mixers', 'Outdoor', 'Workshops', 'Parties'] as const;

/**
 * What a user may set when proposing an event. Deliberately absent: price,
 * status, featured, createdBy — the global ValidationPipe runs with
 * whitelist:true, so those are stripped from the body before this reaches the
 * service. Price is the admin's call (Pi from tickets goes to the app, not the
 * organiser), and status is what moderation controls.
 */
export class CreateEventDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** ISO 8601. Must be in the future — checked in the service, where "now" is. */
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  location!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @IsIn(EVENT_CATEGORIES as unknown as string[])
  category!: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(1000)
  maxAttendees?: number;
}
