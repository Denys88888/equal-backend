import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendDailyMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  /** SYSTEM is used for accepted Truth or Dare cards. */
  @IsOptional()
  @IsIn(['TEXT', 'SYSTEM'])
  kind?: 'TEXT' | 'SYSTEM';
}

export class IcebreakerAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  answer!: string;
}

export class SetVibeDto {
  @IsIn(['deep', 'flirt', 'chat', 'quiet'])
  vibe!: 'deep' | 'flirt' | 'chat' | 'quiet';
}

export class UpdateMatchPrefsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  /** "HH:mm" */
  @IsOptional()
  @IsString()
  @MaxLength(5)
  dailyMatchTime?: string;

  @IsOptional()
  @IsString({ each: true })
  languages?: string[];
}
