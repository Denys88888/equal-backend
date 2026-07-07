import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class PiLoginDto {
  accessToken!: string;
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
