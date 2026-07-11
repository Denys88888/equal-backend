import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MinLength, IsArray, IsOptional } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

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
@Throttle({ default: { ttl: 60000, limit: 10 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('pi')
  @ApiOperation({ summary: 'Login with Pi Network' })
  async piLogin(@Body() dto: PiLoginDto) {
    return this.authService.piLogin(dto.accessToken);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Refresh JWT token' })
  async refresh(@Request() req: { user: { id: string } }) {
    return this.authService.refresh(req.user.id);
  }
}
