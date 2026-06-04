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
  name: string;
  description?: string;
  category: string;
  icon?: string;
}

class CreateClubPostDto {
  content: string;
}

@Controller('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('name') name?: string,
  ): Promise<Club[]> {
    return this.clubsService.findAll(category, name);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Club> {
    const club: Club | null = await this.clubsService.findById(id);
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  @Post()
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
  async joinClub(
    @Param('id') clubId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.joinClub(clubId, req.user.userId);
    return { success: true, message: 'Joined club successfully' };
  }

  @Delete(':id/leave')
  async leaveClub(
    @Param('id') clubId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.leaveClub(clubId, req.user.userId);
    return { success: true, message: 'Left club successfully' };
  }

  @Post(':id/posts')
  async createPost(
    @Param('id') clubId: string,
    @Body() dto: CreateClubPostDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; message: string }> {
    await this.clubsService.createPost(clubId, req.user.userId, dto.content);
    return { success: true, message: 'Post created successfully' };
  }
}
