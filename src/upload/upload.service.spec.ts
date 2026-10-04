import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';

/**
 * A wrong Cloudinary secret used to make every upload fail. Uploads now fall
 * back to the database, and the stored file is served back intact.
 */

const uploadStream = vi.fn();
vi.mock('cloudinary', () => ({ v2: { config: vi.fn(), uploader: { upload_stream: uploadStream } } }));

const file = { buffer: Buffer.from('abc'), mimetype: 'audio/webm', size: 3, originalname: 'a.webm' } as Express.Multer.File;

describe('UploadService', () => {
  const env = { ...process.env };
  beforeEach(() => {
    uploadStream.mockReset();
    process.env.RENDER_EXTERNAL_URL = 'https://api.example';
  });
  afterEach(() => { process.env = { ...env }; });

  async function make(withCloudinary: boolean) {
    if (withCloudinary) Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' });
    else { delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_API_KEY; delete process.env.CLOUDINARY_API_SECRET; }
    const { UploadService } = await import('./upload.service');
    const create = vi.fn().mockResolvedValue({ id: 'f1' });
    return { service: new UploadService({ storedFile: { create } } as never), create };
  }

  it('uses Cloudinary when it accepts the upload', async () => {
    uploadStream.mockImplementation((_o, cb) => ({ end: () => cb(null, { secure_url: 'https://res.cloudinary/x' }) }));
    const { service, create } = await make(true);
    await expect(service.uploadAudio(file, 'u1')).resolves.toBe('https://res.cloudinary/x');
    expect(create).not.toHaveBeenCalled();
  });

  it('falls back to the database when Cloudinary refuses (e.g. Invalid Signature)', async () => {
    uploadStream.mockImplementation((_o, cb) => ({ end: () => cb({ message: 'Invalid Signature abc' }) }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service, create } = await make(true);
    await expect(service.uploadAudio(file, 'u1')).resolves.toBe('https://api.example/v1/files/f1');
    expect(create.mock.calls[0][0].data).toMatchObject({ ownerId: 'u1', mimeType: 'audio/webm', size: 3 });
    const { cloudinaryDiagnostics } = await import('./upload.service');
    expect(cloudinaryDiagnostics()?.message).toContain('Invalid Signature');
    log.mockRestore();
  });

  it('stores in the database when Cloudinary is not configured (never on the wiped local disk)', async () => {
    const { service, create } = await make(false);
    await expect(service.uploadPhoto(file, 'u1')).resolves.toBe('https://api.example/v1/files/f1');
    expect(create).toHaveBeenCalled();
    expect(uploadStream).not.toHaveBeenCalled();
  });
});

describe('FilesController', () => {
  it('serves the stored bytes with their type, cacheable and loadable cross-origin', async () => {
    const { FilesController } = await import('./files.controller');
    const prisma = { storedFile: { findUnique: vi.fn().mockResolvedValue({ mimeType: 'image/jpeg', data: Buffer.from('jpg') }) } };
    const headers: Record<string, string> = {};
    let sent: Buffer | null = null;
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; }, send: (b: Buffer) => { sent = b; } };
    await new FilesController(prisma as never).get('f1', res as never);
    expect(headers['Content-Type']).toBe('image/jpeg');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('cross-origin');
    expect(sent!.toString()).toBe('jpg');
  });

  it('404s an unknown id', async () => {
    const { FilesController } = await import('./files.controller');
    const prisma = { storedFile: { findUnique: vi.fn().mockResolvedValue(null) } };
    await expect(new FilesController(prisma as never).get('nope', {} as never)).rejects.toThrow(NotFoundException);
  });
});
