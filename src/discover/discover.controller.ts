import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DiscoverService, DiscoverProfileDto } from './discover.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
  };
}

@ApiTags('Discover')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('discover')
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  @Get()
  @ApiOperation({ summary: 'Discover profiles with filters' })
  @ApiQuery({ name: 'gender', required: false, description: 'Filter by gender' })
  @ApiQuery({ name: 'minAge', required: false, description: 'Minimum age' })
  @ApiQuery({ name: 'maxAge', required: false, description: 'Maximum age' })
  @ApiQuery({ name: 'city', required: false, description: 'Filter by city' })
  @ApiResponse({ status: 200, description: 'Profiles discovered successfully' })
  async getProfiles(
    @Req() req: AuthenticatedRequest,
    @Query('gender') gender?: string,
    @Query('minAge') minAge?: string,
    @Query('maxAge') maxAge?: string,
    @Query('city') city?: string,
    @Query() pagination?: PaginationDto,
  ): Promise<{
    profiles: DiscoverProfileDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const userId: string = req.user.userId;

    return this.discoverService.getDiscoverProfiles(userId, {
      gender,
      minAge: minAge ? parseInt(minAge, 10) : undefined,
      maxAge: maxAge ? parseInt(maxAge, 10) : undefined,
      city,
      page: pagination?.page,
      limit: pagination?.limit,
    });
  }
}
