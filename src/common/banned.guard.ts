import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Blocks every request from a user serving an auto-ban (3 reports in 24h).
 *
 * Runs after JwtAuthGuard, so req.user is already populated. A ban that has
 * elapsed is cleared here rather than by a cron — checking on access means a
 * lapsed ban is lifted the moment the user comes back, with no scheduled job
 * to fall behind.
 */
@Injectable()
export class BannedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    const userId = req.user?.id;
    if (!userId) return true;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bannedUntil: true, isActive: true },
    });
    if (!user) return true;

    if (!user.isActive) {
      throw new ForbiddenException('Account suspended');
    }

    if (user.bannedUntil) {
      if (user.bannedUntil.getTime() > Date.now()) {
        const minutesLeft = Math.ceil((user.bannedUntil.getTime() - Date.now()) / 60000);
        throw new ForbiddenException(`Temporarily banned. Try again in ${minutesLeft} minutes.`);
      }
      await this.prisma.user.update({ where: { id: userId }, data: { bannedUntil: null } });
    }

    return true;
  }
}
