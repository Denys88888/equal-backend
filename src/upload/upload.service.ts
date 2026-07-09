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

    // Fallback: save to local /uploads (development / Render without Cloudinary)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    return `/uploads/${filename}`;
  }
}
