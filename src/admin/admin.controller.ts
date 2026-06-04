import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ForbiddenException,
  ParseIntPipe,
  DefaultValuePipe,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '@prisma/client';

interface AdminRequest {
  user: {
    id: string;
    email?: string | null;
    role: Role;
  };
}

interface UpdateRoleDto {
  role: Role;
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private checkAdmin(req: AdminRequest): void {
    if (req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }

  @Get('users')
  async findUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search: string,
    @Req() req: AdminRequest,
  ): Promise<{
    data: Array<{
      id: string;
      email: string | null;
      name: string;
      username: string;
      role: Role;
      verified: boolean;
      isActive: boolean;
      trustScore: number;
      createdAt: Date;
    }>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    this.checkAdmin(req);
    return this.adminService.findUsers(page, limit, search);
  }

  @Get('users/:id')
  async findUserById(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{
    id: string;
    email: string | null;
    name: string;
    username: string;
    role: Role;
    verified: boolean;
    isActive: boolean;
    trustScore: number;
    sparkBalance: number;
    createdAt: Date;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      gender: string | null;
      lookingFor: string[];
      interests: string[];
      completionPercent: number;
      profileComplete: boolean;
    } | null;
    photos: Array<{ id: string; url: string; isMain: boolean; order: number }>;
  }> {
    this.checkAdmin(req);
    return this.adminService.findUserById(id);
  }

  @Patch('users/:id/role')
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; role: Role }> {
    this.checkAdmin(req);
    return this.adminService.updateRole(id, body.role);
  }

  @Patch('users/:id/verify')
  async toggleVerify(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; verified: boolean }> {
    this.checkAdmin(req);
    return this.adminService.toggleVerify(id);
  }

  @Get('reports')
  async findReports(
    @Req() req: AdminRequest,
  ): Promise<
    Array<{
      id: string;
      reporterId: string;
      targetId: string;
      reason: string;
      description: string | null;
      status: string;
      createdAt: Date;
    }>
  > {
    this.checkAdmin(req);
    return this.adminService.findReports();
  }

  @Patch('reports/:id/resolve')
  async resolveReport(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; status: string }> {
    this.checkAdmin(req);
    return this.adminService.resolveReport(id);
  }

  @Patch('reports/:id/dismiss')
  async dismissReport(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; status: string }> {
    this.checkAdmin(req);
    return this.adminService.dismissReport(id);
  }

  @Get('stats')
  async getStats(
    @Req() req: AdminRequest,
  ): Promise<{
    totalUsers: number;
    totalMatches: number;
    totalMessages: number;
    totalReports: number;
    pendingReports: number;
  }> {
    this.checkAdmin(req);
    return this.adminService.getStats();
  }
}
