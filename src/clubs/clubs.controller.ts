import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { Club } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

class CreateClubDto {
  name!: string;
  description?: string;
  category!: string;
  icon?: string;
}

class CreateClubPostDto {
  content!: string;
}

@ApiTags('Clubs')
@ApiBearerAuth()
@Controller('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  @ApiOperation({ summary: 'List all clubs' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'name', required: false, description: 'Search by name' })
  @ApiResponse({ status: 200, description: 'Clubs retrieved successfully' })
  async findAll(
    @Query('category') category?: string,
    @Query('name') name?: string,
  ): Promise<Club[]> {
    return this.clubsService.findAll(category, name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get club by ID' })
  @ApiParam({ name: 'id', description: 'Club ID' })
  @ApiResponse({ status: 200, description: 'Club retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Club not found' })
  async findById(@Param('id') id: string): Promise<Club> {
    const club: Club | null = await this.clubsService.findById(id);
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new club (admin only)' })
  @ApiBody({ type: CreateClubDto })
  @ApiResponse({ status: 201, description: 'Club created successfully' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async create(
    @Body() dto: CreateClubDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Club> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can create clubs');
    }
    return this.clubsService.create(dto);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a club' })
  @ApiParam({ name: 'id', description: 'Club ID' })
  @ApiResponse({ status: 201, description: 'Joined club successfully' })
  async joinClub(
    @Param('id') clubId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.joinClub(clubId, req.user.userId);
    return { success: true, message: 'Joined club successfully' };
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave a club' })
  @ApiParam({ name: 'id', description: 'Club ID' })
  @ApiResponse({ status: 200, description: 'Left club successfully' })
  async leaveClub(
    @Param('id') clubId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.leaveClub(clubId, req.user.userId);
    return { success: true, message: 'Left club successfully' };
  }

  @Post(':id/posts')
  @ApiOperation({ summary: 'Create a post in a club' })
  @ApiParam({ name: 'id', description: 'Club ID' })
  @ApiBody({ type: CreateClubPostDto })
  @ApiResponse({ status: 201, description: 'Post created successfully' })
  async createPost(
    @Param('id') clubId: string,
    @Body() dto: CreateClubPostDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.createPost(clubId, req.user.userId, dto.content);
    return { success: true, message: 'Post created successfully' };
  }
}
