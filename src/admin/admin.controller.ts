import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getUsers();
  }

  @Get('reports')
  async getReports() {
    return this.adminService.getReports();
  }

  @Patch('reports/:id')
  async updateReport(@Param('id') id: string, @Body() body: { status: string }) {
    return this.adminService.updateReport(id, body.status);
  }

  @Post('users/:id/ban')
  async banUser(@Param('id') id: string) {
    return this.adminService.setUserActive(id, false);
  }

  @Post('users/:id/unban')
  async unbanUser(@Param('id') id: string) {
    return this.adminService.setUserActive(id, true);
  }
}
