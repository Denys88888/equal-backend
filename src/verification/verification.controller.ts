import {
  Controller, Get, Post, Body, Param, UseGuards, Request,
  UseInterceptors, UploadedFile, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerificationService } from './verification.service';

@ApiTags('Verification')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  private checkAdmin(req: { user: { role?: string } }) {
    if (req.user?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  /** The frontend has been posting here since before the route existed. */
  @Post('verification/selfie')
  @UseInterceptors(FileInterceptor('video', {
    storage: memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
  }))
  async submitSelfie(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body('gesture') gesture: string,
  ) {
    return this.verification.submitSelfie(req.user.id, file, gesture);
  }

  @Get('verification/me')
  async myStatus(@Request() req: { user: { id: string } }) {
    return this.verification.getMyStatus(req.user.id);
  }

  @Get('admin/verifications')
  async listPending(@Request() req: { user: { role?: string } }) {
    this.checkAdmin(req);
    return this.verification.listPending();
  }

  @Post('admin/verifications/:id/approve')
  async approve(@Request() req: { user: { role?: string } }, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.verification.review(id, true);
  }

  @Post('admin/verifications/:id/reject')
  async reject(@Request() req: { user: { role?: string } }, @Param('id') id: string) {
    this.checkAdmin(req);
    return this.verification.review(id, false);
  }
}
