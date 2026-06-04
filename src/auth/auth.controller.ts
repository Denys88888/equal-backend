import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { PiLoginDto } from './dto/pi-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Post('pi')
  @ApiOperation({ summary: 'Login with Pi Network' })
  @ApiBody({ type: PiLoginDto })
  @ApiResponse({ status: 201, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async piLogin(@Body() dto: PiLoginDto) {
    console.log('[AUTH] piLogin called, accessToken present:', !!dto.accessToken, 'scopes:', dto.scopes);
    return this.svc.piLogin(dto.accessToken, dto.scopes || []);
  }
}
