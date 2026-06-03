import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparksService } from './sparks.service';

@ApiTags('Sparks')
@Controller('sparks')
export class SparksController {
  constructor(private readonly sparksService: SparksService) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getBalance(@Request() req: { user: { id: string } }) {
    return this.sparksService.getBalance(req.user.id);
  }

  @Post('earn')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async earn(@Request() req: { user: { id: string } }, @Body() body: { action: string }) {
    return this.sparksService.earn(req.user.id, body.action);
  }
}
