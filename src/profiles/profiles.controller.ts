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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ProfilesService, ProfileWithPhotos, UpsertProfileInput } from './profiles.service';
import { Profile, Photo } from '@prisma/client';

class UpsertProfileDto {
  bio?: string;
  birthDate?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  gender?: string;
  lookingFor?: string[];
  goals?: string[];
  interests?: string[];
}

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
  async updateMyProfile(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: UpsertProfileDto,
  ): Promise<Profile> {
    const userId: string = req.user.userId;
    const data: UpsertProfileInput = {};

    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.birthDate !== undefined) data.birthDate = dto.birthDate;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.lookingFor !== undefined) data.lookingFor = dto.lookingFor;
    if (dto.goals !== undefined) data.goals = dto.goals;
    if (dto.interests !== undefined) data.interests = dto.interests;

    return this.profilesService.upsertProfile(userId, data);
  }

  @Post('me/photos')
  async addPhoto(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: AddPhotoDto,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.addPhoto(userId, dto.url);
  }

  @Patch('me/photos/:photoId/main')
  async setMainPhoto(
    @Req() req: { user: AuthenticatedUser },
    @Param('photoId') photoId: string,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.setMainPhoto(userId, photoId);
  }

  @Delete('me/photos/:photoId')
  async deletePhoto(
    @Req() req: { user: AuthenticatedUser },
    @Param('photoId') photoId: string,
  ): Promise<Photo> {
    const userId: string = req.user.userId;
    return this.profilesService.deletePhoto(userId, photoId);
  }
}
