import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService, UserWithRelations, PublicProfile, UpdateUserInput } from './users.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { User } from '@prisma/client';

class UpdateUserDto {
  name?: string;
  avatar?: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMe(@Req() req: { user: AuthenticatedUser }): Promise<UserWithRelations> {
    const userId: string = req.user.userId;
    const user: UserWithRelations | null = await this.usersService.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateMe(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    const userId: string = req.user.userId;
    const updateData: UpdateUserInput = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name;
    }
    if (dto.avatar !== undefined) {
      updateData.avatar = dto.avatar;
    }

    return this.usersService.updateUser(userId, updateData);
  }

  @Get(':id/public')
  @ApiOperation({ summary: 'Get public profile of a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Public profile retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(@Param('id') id: string): Promise<PublicProfile> {
    return this.usersService.findPublicProfile(id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  async deleteMe(@Req() req: { user: AuthenticatedUser }): Promise<User> {
    const userId: string = req.user.userId;
    return this.usersService.deactivateUser(userId);
  }
}
