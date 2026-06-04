import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class PiLoginDto {
  accessToken!: string;
  scopes!: string[];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('pi')
  async piLogin(@Body() dto: PiLoginDto) {
    return this.svc.piLogin(dto.accessToken, dto.scopes);
  }
}
