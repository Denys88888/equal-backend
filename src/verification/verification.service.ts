import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

const GESTURES = ['blink', 'smile', 'turn_left', 'turn_right'];

@Injectable()
export class VerificationService {
  constructor(
    private prisma: PrismaService,
    private upload: UploadService,
  ) {}

  /**
   * Accepts a liveness selfie for review. There is no automated liveness check —
   * an admin approves or rejects via /admin/verifications, which is what
   * actually flips User.verified. Nothing here trusts the client.
   */
  async submitSelfie(userId: string, file: Express.Multer.File, gesture: string) {
    if (!file) throw new BadRequestException('No media provided');
    if (!GESTURES.includes(gesture)) throw new BadRequestException('Unknown gesture');
    const ok = file.mimetype?.startsWith('video/') || file.mimetype?.startsWith('image/');
    if (!ok) throw new BadRequestException('Media must be a video or image');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { verified: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.verified) return { status: 'approved' as const, message: 'Already verified' };

    const pending = await this.prisma.verificationRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (pending) {
      return { status: 'pending' as const, message: 'A request is already under review' };
    }

    const mediaUrl = await this.upload.uploadVerificationMedia(file, userId);
    await this.prisma.verificationRequest.create({ data: { userId, mediaUrl, gesture } });

    return { status: 'pending' as const, message: 'Submitted for review' };
  }

  /** Current state for the signed-in user, so the UI can show progress. */
  async getMyStatus(userId: string) {
    const [user, latest] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { verified: true } }),
      this.prisma.verificationRequest.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { status: true, gesture: true, createdAt: true, reviewedAt: true },
      }),
    ]);
    if (user?.verified) return { status: 'approved' as const };
    if (!latest) return { status: 'none' as const };
    return {
      status: latest.status.toLowerCase() as 'pending' | 'approved' | 'rejected',
      gesture: latest.gesture,
      submittedAt: latest.createdAt,
      reviewedAt: latest.reviewedAt,
    };
  }

  // ── Admin review ────────────────────────────────────────

  async listPending() {
    return this.prisma.verificationRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { user: { select: { id: true, name: true, username: true } } },
    });
  }

  async review(requestId: string, approve: boolean) {
    const req = await this.prisma.verificationRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Already reviewed');

    // Approving is the only path that sets User.verified, which in turn is what
    // the `verification` spark reward and the verifiedOnly filter check.
    const [updated] = await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: requestId },
        data: { status: approve ? 'APPROVED' : 'REJECTED', reviewedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: req.userId },
        data: { verified: approve },
      }),
    ]);
    return { success: true, status: updated.status };
  }
}
