import { IsString, IsArray, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PiLoginDto {
  @ApiProperty({ description: 'Pi SDK access token' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({ description: 'Granted scopes', example: ['username', 'payments'] })
  @IsArray()
  @IsString({ each: true })
  scopes!: string[];
}
