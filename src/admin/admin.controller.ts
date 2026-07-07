import { Controller, Get, Patch, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
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
}
