import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';

type UploadKind = 'photo' | 'audio' | 'verification';

let lastCloudinaryError: { at: string; message: string } | null = null;

/**
 * Credential errors don't fix themselves: once Cloudinary rejects our key or
 * signature, every later upload would fail the same way first. Stop trying
 * until the next restart (a credentials change on Render restarts the service).
 */
const CREDENTIAL_ERROR = /invalid signature|invalid api[_ ]key|unknown api[_ ]key|invalid cloud[_ ]name|must supply api_key/i;
let cloudinaryDisabled = false;

/** The last Cloudinary failure (message only), shown on /v1/health. */
export function cloudinaryDiagnostics() {
  return lastCloudinaryError ? { ...lastCloudinaryError, disabledUntilRestart: cloudinaryDisabled } : null;
}

/** Test hook: start each test with Cloudinary enabled again. */
export function resetCloudinaryState() {
  cloudinaryDisabled = false;
  lastCloudinaryError = null;
}

/**
 * Stores uploaded media. Cloudinary when it is configured and accepts the
 * upload; otherwise the file is kept in the database (StoredFile) and served
 * by GET /v1/files/:id.
 *
 * Until 2026-10-04 a Cloudinary failure was simply thrown: with a wrong
 * CLOUDINARY_API_SECRET on Render ("Invalid Signature"), every profile photo,
 * voice intro, chat image, voice message and verification selfie failed to
 * save. When Cloudinary was not configured the fallback wrote to Render's
 * local disk, which every deploy wipes.
 */
@Injectable()
export class UploadService {
  private readonly useCloudinary: boolean;

  constructor(private prisma: PrismaService) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    this.useCloudinary = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
    if (this.useCloudinary) {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
      });
    }
  }

  uploadPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    return this.store(file, userId, 'photo', {
      folder: `equal/${userId}`,
      resource_type: 'image',
      transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
    });
  }

  /** Voice notes. Cloudinary serves audio under resource_type 'video'. */
  uploadAudio(file: Express.Multer.File, userId: string): Promise<string> {
    return this.store(file, userId, 'audio', { folder: `equal/${userId}/voice`, resource_type: 'video' });
  }

  /**
   * Profile video intro. Cloudinary only: a video is too big for the database
   * fallback. Converted while uploading to H.264/AAC MP4, at most 720 px wide —
   * Android records WebM and iPhone records HEVC .mov, and neither plays on
   * the other platform.
   */
  async uploadVideo(file: Express.Multer.File, userId: string): Promise<{ url: string; duration: number | null; publicId: string }> {
    if (!this.useCloudinary || cloudinaryDisabled) {
      throw new ServiceUnavailableException('Video uploads are unavailable right now');
    }
    try {
      const res = await new Promise<{ secure_url: string; public_id: string; duration?: number; eager?: { secure_url: string }[] }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `equal/${userId}/video`,
            resource_type: 'video',
            eager: [{ width: 720, crop: 'limit', video_codec: 'h264', audio_codec: 'aac', quality: 'auto', format: 'mp4' }],
          },
          (err, out) => (err || !out ? reject(err ?? new Error('Empty Cloudinary response')) : resolve(out as never)),
        );
        stream.end(file.buffer);
      });
      return { url: res.eager?.[0]?.secure_url ?? res.secure_url, duration: res.duration ?? null, publicId: res.public_id };
    } catch (err) {
      const message = String((err as { message?: string })?.message ?? err).slice(0, 300);
      lastCloudinaryError = { at: new Date().toISOString(), message };
      if (CREDENTIAL_ERROR.test(message)) cloudinaryDisabled = true;
      console.error('[upload] video upload failed:', message);
      throw new ServiceUnavailableException('Could not store the video');
    }
  }

  /** Best effort: a leftover video only costs storage. */
  async deleteVideo(publicId: string): Promise<void> {
    if (!this.useCloudinary) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' }).catch(() => {});
  }

  /**
   * Verification media (a short selfie video or still). Only ever shown to
   * admins during review, never on a profile.
   */
  uploadVerificationMedia(file: Express.Multer.File, userId: string): Promise<string> {
    return this.store(file, userId, 'verification', { folder: `equal/${userId}/verification`, resource_type: 'auto' });
  }

  private async store(
    file: Express.Multer.File,
    userId: string,
    _kind: UploadKind,
    options: Record<string, unknown>,
  ): Promise<string> {
    if (this.useCloudinary && !cloudinaryDisabled) {
      try {
        const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(options, (err, res) => {
            if (err || !res) reject(err ?? new Error('Empty Cloudinary response'));
            else resolve(res);
          });
          uploadStream.end(file.buffer);
        });
        return result.secure_url;
      } catch (err) {
        const message = String((err as { message?: string })?.message ?? err).slice(0, 300);
        lastCloudinaryError = { at: new Date().toISOString(), message };
        if (CREDENTIAL_ERROR.test(message)) cloudinaryDisabled = true;
        console.error('[upload] Cloudinary failed, storing in the database instead:', message);
      }
    }
    return this.saveToDatabase(file, userId);
  }

  private async saveToDatabase(file: Express.Multer.File, userId: string): Promise<string> {
    const stored = await this.prisma.storedFile.create({
      data: {
        ownerId: userId,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size ?? file.buffer.length,
        data: file.buffer,
      },
      select: { id: true },
    });
    // Absolute: the frontend is a different origin, so a bare path would
    // resolve against it and 404.
    const base = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${base}/v1/files/${stored.id}`;
  }
}
