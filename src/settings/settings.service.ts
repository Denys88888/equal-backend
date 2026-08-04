import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SUPPORT_EMAIL_KEY = 'support_email';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSupportEmail(): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SUPPORT_EMAIL_KEY } });
    return row?.value ?? null;
  }

  /**
   * Settings' Help Center / Report a Problem rows had no destination at all —
   * there was no support email anywhere in the codebase, and fabricating one
   * would be worse than a dead button (an unmonitored address swallowing real
   * safety reports). This makes the address a real, admin-owned value instead.
   */
  async setSupportEmail(email: string) {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) throw new BadRequestException('Not a valid email address');
    await this.prisma.appSetting.upsert({
      where: { key: SUPPORT_EMAIL_KEY },
      update: { value: trimmed },
      create: { key: SUPPORT_EMAIL_KEY, value: trimmed },
    });
    return { success: true, email: trimmed };
  }
}
