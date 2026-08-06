import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class UploadService {
  private readonly useCloudinary: boolean;

  constructor() {
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

  async uploadPhoto(file: Express.Multer.File, userId: string): Promise<string> {
    if (this.useCloudinary) {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: `equal/${userId}`, resource_type: 'image', transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }] },
          (err, res) => { if (err || !res) reject(err); else resolve(res); },
        );
        uploadStream.end(file.buffer);
      });
      return result.secure_url;
    }
    return this.saveLocal(file);
  }

  /** Voice notes. Cloudinary serves audio under resource_type 'video'. */
  async uploadAudio(file: Express.Multer.File, userId: string): Promise<string> {
    if (this.useCloudinary) {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: `equal/${userId}/voice`, resource_type: 'video' },
          (err, res) => { if (err || !res) reject(err); else resolve(res); },
        );
        uploadStream.end(file.buffer);
      });
      return result.secure_url;
    }
    return this.saveLocal(file);
  }

  /**
   * Verification media (a short selfie video or still). Kept in a private-ish
   * folder — it is only ever shown to admins during review, never on a profile.
   */
  async uploadVerificationMedia(file: Express.Multer.File, userId: string): Promise<string> {
    if (this.useCloudinary) {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: `equal/${userId}/verification`, resource_type: 'auto' },
          (err, res) => { if (err || !res) reject(err); else resolve(res); },
        );
        uploadStream.end(file.buffer);
      });
      return result.secure_url;
    }
    return this.saveLocal(file);
  }

  /** Fallback: save to local /uploads (development / Render without Cloudinary) */
  private saveLocal(file: Express.Multer.File): string {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const safeName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    // Must be absolute: the frontend is a separate origin (equal-app.onrender.com),
    // so a bare "/uploads/..." path resolves against the FRONTEND's origin in an
    // <img> tag and 404s there — only this backend actually serves /uploads.
    const base = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${base}/uploads/${filename}`;
  }
}
