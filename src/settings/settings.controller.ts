import { Controller, Get, Put, Body, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Any signed-in user can read it — this is what Help Center / Report a Problem read. */
  @Get('settings/support-email')
  async getSupportEmail() {
    return { email: await this.settings.getSupportEmail() };
  }

  @Put('admin/settings/support-email')
  async setSupportEmail(
    @Request() req: { user: { role?: string } },
    @Body() body: { email: string },
  ) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
    return this.settings.setSupportEmail(body.email);
  }
}
