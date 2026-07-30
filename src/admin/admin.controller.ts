import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private checkAdmin(req: { user: { role?: string } }) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  @Get('stats')
  async getStats(@Request() req: { user: { role?: string } }) {
    this.checkAdmin(req);
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers(@Request() req: { user: { role?: string } }) {
    this.checkAdmin(req);
    return this.adminService.getUsers();
  }

  @Get('reports')
  async getReports(@Request() req: { user: { role?: string } }) {
    this.checkAdmin(req);
    return this.adminService.getReports();
  }

  @Patch('reports/:id')
  async updateReport(
    @Request() req: { user: { role?: string } },
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    this.checkAdmin(req);
    return this.adminService.updateReport(id, body.status);
  }

  // The routes below existed in the frontend API client but not here, so every
  // ban / trust / badge / resolve action 404'd and was swallowed by the client's
  // .catch(), leaving the admin UI showing success it never achieved.

  @Post('users/:id/ban')
  async banUser(@Request() req: { user: { role?: string } }, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.adminService.setBan(id, true);
  }

  @Post('users/:id/unban')
  async unbanUser(@Request() req: { user: { role?: string } }, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.adminService.setBan(id, false);
  }

  @Post('users/:id/trust')
  async adjustTrust(
    @Request() req: { user: { role?: string } },
    @Param('id') id: string,
    @Body() body: { score?: number; trustScore?: number },
  ) {
    this.checkAdmin(req);
    return this.adminService.adjustTrust(id, body.score ?? body.trustScore ?? NaN);
  }

  @Post('users/:id/badges')
  async awardBadge(
    @Request() req: { user: { role?: string } },
    @Param('id') id: string,
    @Body() body: { badge: string },
  ) {
    this.checkAdmin(req);
    return this.adminService.awardBadge(id, body.badge);
  }

  @Post('users/:id/verify')
  async verifyUser(
    @Request() req: { user: { role?: string } },
    @Param('id') id: string,
    @Body() body: { verified?: boolean },
  ) {
    this.checkAdmin(req);
    return this.adminService.setVerified(id, body.verified ?? true);
  }

  @Post('reports/:id/resolve')
  async resolveReport(
    @Request() req: { user: { role?: string } },
    @Param('id') id: string,
    @Body() body: { action: string },
  ) {
    this.checkAdmin(req);
    return this.adminService.resolveReport(id, body.action);
  }
}
