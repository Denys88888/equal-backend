import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
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
}
