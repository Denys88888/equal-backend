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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Role } from '@prisma/client';

interface AdminRequest {
  user: {
    id: string;
    role: Role;
  };
}

class UpdateRoleDto {
  role!: Role;
}

@ApiTags('Admin')
@ApiBearerAuth()
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
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search: string,
    @Req() req: AdminRequest,
  ): Promise<{
    data: Array<{
      id: string;
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
  @ApiOperation({ summary: 'Get user details by ID (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findUserById(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{
    id: string;
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
  @ApiOperation({ summary: 'Update user role (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({ status: 200, description: 'User role updated' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async updateRole(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; role: Role }> {
    this.checkAdmin(req);
    return this.adminService.updateRole(id, body.role);
  }

  @Patch('users/:id/verify')
  @ApiOperation({ summary: 'Toggle user verification (admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User verification toggled' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async toggleVerify(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; verified: boolean }> {
    this.checkAdmin(req);
    return this.adminService.toggleVerify(id);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List all reports (admin only)' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
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
  @ApiOperation({ summary: 'Resolve a report (admin only)' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report resolved' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async resolveReport(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; status: string }> {
    this.checkAdmin(req);
    return this.adminService.resolveReport(id);
  }

  @Patch('reports/:id/dismiss')
  @ApiOperation({ summary: 'Dismiss a report (admin only)' })
  @ApiParam({ name: 'id', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report dismissed' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async dismissReport(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ): Promise<{ id: string; status: string }> {
    this.checkAdmin(req);
    return this.adminService.dismissReport(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
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
