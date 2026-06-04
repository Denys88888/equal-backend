import { IsOptional, IsString, IsDate, IsArray, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'User bio', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ description: 'Birth date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'Looking for preferences', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lookingFor?: string[];

  @ApiPropertyOptional({ description: 'Relationship goals', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @ApiPropertyOptional({ description: 'User interests', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];
}
