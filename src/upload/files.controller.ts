import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Serves media stored in the database by UploadService. Public, like the
 * Cloudinary URLs it stands in for: <img>/<audio> tags cannot send auth
 * headers, and ids are unguessable cuids.
 */
// A screen of profile cards loads many images at once; counting them against
// the API rate limit (100 per 15 min) would lock people out of the app.
@SkipThrottle()
@Controller('files')
export class FilesController {
  constructor(private prisma: PrismaService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Res() res: Response) {
    const file = await this.prisma.storedFile.findUnique({
      where: { id },
      select: { mimeType: true, data: true },
    });
    if (!file) throw new NotFoundException('File not found');
    res.setHeader('Content-Type', file.mimeType);
    // Content never changes for an id, so it can be cached for good.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Loaded by the frontend, which is another origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(Buffer.from(file.data));
  }
}
