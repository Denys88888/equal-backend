import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAskDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;
}

export class AnswerAskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  answer!: string;
}

export class ReportAskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
