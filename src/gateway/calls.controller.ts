import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { iceServers } from './ice-servers';

@ApiTags('Calls')
@Controller('calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CallsController {
  /** STUN plus, when configured, a TURN relay with short-lived credentials. */
  @Get('ice-servers')
  async getIceServers() {
    return { iceServers: await iceServers() };
  }
}
