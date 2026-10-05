import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';

/**
 * The onboarding "video intro" used to stay on the phone: nothing uploaded it
 * and no screen showed it. It is now stored and served like the voice intro.
 */
function setup(upload: { url: string; duration: number | null; publicId: string } = { url: 'https://res.cloudinary.com/c/video/upload/eager/v.mp4', duration: 12, publicId: 'equal/u/video/v' }) {
  const usersService = { setVideoIntro: vi.fn((_id: string, url: string) => Promise.resolve({ videoIntroUrl: url })) };
  const uploadService = { uploadVideo: vi.fn().mockResolvedValue(upload), deleteVideo: vi.fn().mockResolvedValue(undefined) };
  const controller = new UsersController(usersService as never, uploadService as never, {} as never);
  return { controller, usersService, uploadService };
}
const req = { user: { id: 'u1' } };
const file = (mimetype: string, size = 1000) => ({ mimetype, size, buffer: Buffer.alloc(size) }) as Express.Multer.File;

describe('POST /users/me/video-intro', () => {
  it('stores a recorded clip and saves the converted MP4 on the user', async () => {
    const { controller, usersService, uploadService } = setup();
    await expect(controller.uploadVideoIntro(req, file('video/webm'))).resolves.toEqual({
      videoIntroUrl: 'https://res.cloudinary.com/c/video/upload/eager/v.mp4',
    });
    expect(uploadService.uploadVideo).toHaveBeenCalledWith(expect.anything(), 'u1');
    expect(usersService.setVideoIntro).toHaveBeenCalledWith('u1', 'https://res.cloudinary.com/c/video/upload/eager/v.mp4');
  });

  it('accepts what iPhones record (video/mp4, video/quicktime)', async () => {
    for (const type of ['video/mp4', 'video/quicktime']) {
      const { controller, usersService } = setup();
      await controller.uploadVideoIntro(req, file(type));
      expect(usersService.setVideoIntro).toHaveBeenCalled();
    }
  });

  it('refuses anything that is not a video, and empty uploads', async () => {
    const { controller, uploadService } = setup();
    await expect(controller.uploadVideoIntro(req, file('image/jpeg'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.uploadVideoIntro(req, file('video/webm', 0))).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.uploadVideoIntro(req, undefined as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(uploadService.uploadVideo).not.toHaveBeenCalled();
  });

  it('deletes and refuses a clip longer than 30 seconds', async () => {
    const { controller, usersService, uploadService } = setup({ url: 'https://x/v.mp4', duration: 95, publicId: 'equal/u/video/long' });
    await expect(controller.uploadVideoIntro(req, file('video/mp4'))).rejects.toBeInstanceOf(BadRequestException);
    expect(uploadService.deleteVideo).toHaveBeenCalledWith('equal/u/video/long');
    expect(usersService.setVideoIntro).not.toHaveBeenCalled();
  });
});
