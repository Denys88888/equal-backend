import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class LoginDto { email!: string; password!: string; }
class PiLoginDto { accessToken!: string; }

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('email/register') register(@Body() dto: LoginDto) { return this.svc.register(dto.email, dto.password); }
  @Post('email/login') login(@Body() dto: LoginDto) { return this.svc.login(dto.email, dto.password); }
  @Post('pi') piLogin(@Body() dto: PiLoginDto) { return this.svc.piLogin(dto.accessToken); }
}
