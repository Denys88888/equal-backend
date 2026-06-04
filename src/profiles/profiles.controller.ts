import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ProfilesService, ProfileWithPhotos, UpsertProfileInput } from './profiles.service';
import { Profile, Photo } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

class AddPhotoDto {
  url!: string;
}

@ApiTags('Profiles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getMyProfile(
    @Req() req: { user: AuthenticatedUser },
  ): Promise<ProfileWithPhotos> {
    const userId: string = req.user.userId;
    const profile: ProfileWithPhotos | null =
      await this.profilesService.getProfile(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  @Put('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMyProfile(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: UpdateProfileDto,
  ): Promise<Profile> {
    const userId: string = req.user.userId;
    const data: UpsertProfileInput = {};

    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.lookingFor !== undefined) data.lookingFor = dto.lookingFor;
    if (dto.goals !== undefined) data.goals = dto.goals;
    if (dto.interests !== undefined) data.interests = dto.interests;

    return this.profilesService.upsertProfile(userId, data);
  }

  @Post('me/photos')
  @ApiOperation({ summary: 'Add a photo to profile' })
  @ApiBody({ type: AddPhotoDto })
  @ApiResponse({ status: 201, description: 'Photo added successfully' })
  async addPhoto(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: AddPhotoDto,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.addPhoto(userId, dto.url);
  }

  @Patch('me/photos/:photoId/main')
  @ApiOperation({ summary: 'Set main profile photo' })
  @ApiParam({ name: 'photoId', description: 'Photo ID' })
  @ApiResponse({ status: 200, description: 'Main photo set successfully' })
  async setMainPhoto(
    @Req() req: { user: AuthenticatedUser },
    @Param('photoId') photoId: string,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.setMainPhoto(userId, photoId);
  }

  @Delete('me/photos/:photoId')
  @ApiOperation({ summary: 'Delete a profile photo' })
  @ApiParam({ name: 'photoId', description: 'Photo ID' })
  @ApiResponse({ status: 200, description: 'Photo deleted successfully' })
  async deletePhoto(
    @Req() req: { user: AuthenticatedUser },
    @Param('photoId') photoId: string,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.deletePhoto(userId, photoId);
  }
}
