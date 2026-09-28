import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** The categories the Clubs screen offers (and has gradients and icons for). */
export const CLUB_CATEGORIES = [
  'Sports', 'Movies', 'Tech', 'Travel', 'Cooking', 'Music', 'Reading', 'Gaming', 'Fitness', 'Art',
] as const;

/**
 * What a user may set when creating a club. The body used to be spread straight
 * into prisma.club.create, so anything else a client sent was written to the
 * row — a made-up memberCount, an icon, a chosen id, a back-dated createdAt.
 * The global ValidationPipe runs with whitelist:true, so declaring only these
 * three fields strips every other one before it reaches the service.
 */
export class CreateClubDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(CLUB_CATEGORIES as unknown as string[])
  category!: string;
}

/**
 * A post may be photo-only, so its text is optional. The limit is generous on
 * purpose: the app sets none, so this only has to stop abuse, not real posts.
 * A non-string used to reach `.trim()` in the service and come back as a 500.
 */
export class PostContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;
}

/** Comments and chat messages: text is required (the service rejects empty). */
export class TextContentDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}
