import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class LoginDto {
  email!: string;
  password!: string;
}

class PiLoginDto {
  accessToken!: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('email/register')
  @ApiOperation({ summary: 'Register with email' })
  async register(@Body() dto: LoginDto) {
    return this.authService.register(dto.email, dto.password);
  }

  @Post('email/login')
  @ApiOperation({ summary: 'Login with email' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('pi')
  @ApiOperation({ summary: 'Login with Pi Network' })
  async piLogin(@Body() dto: PiLoginDto) {
    return this.authService.piLogin(dto.accessToken);
  }
}
