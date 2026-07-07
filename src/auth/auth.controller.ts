import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MinLength, IsArray, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';

class PiLoginDto {
  @IsString()
  @MinLength(10)
  accessToken!: string;

  @IsArray()
  @IsOptional()
  scopes?: string[];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('pi')
  @ApiOperation({ summary: 'Login with Pi Network' })
  async piLogin(@Body() dto: PiLoginDto) {
    return this.authService.piLogin(dto.accessToken);
  }
}
