import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, activeToday, totalMatches, pendingReports] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { updatedAt: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.match.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);
    return { totalUsers, activeToday, totalMatches, pendingReports };
  }

  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true, name: true, email: true, trustScore: true, verified: true,
        isActive: true, badges: true, createdAt: true,
        profile: { select: { bio: true } },
        _count: { select: { matches1: true, matches2: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // Shape it the way the admin UI expects (status label, match count, bio)
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      trustScore: u.trustScore,
      verified: u.verified,
      badges: u.badges,
      bio: u.profile?.bio ?? '',
      matches: u._count.matches1 + u._count.matches2,
      status: u.isActive ? 'Active' : 'Banned',
      joinDate: u.createdAt,
    }));
  }

  async setBan(userId: string, banned: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: !banned } });
    return { success: true, status: banned ? 'Banned' : 'Active' };
  }

  async adjustTrust(userId: string, score: number) {
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new BadRequestException('Trust score must be between 0 and 100');
    }
    const rounded = Math.round(score);
    // trustScore lives on both User and Profile — keep them from drifting apart
    await this.prisma.user.update({ where: { id: userId }, data: { trustScore: rounded } });
    await this.prisma.profile.updateMany({ where: { userId }, data: { trustScore: rounded } });
    return { success: true, trustScore: rounded };
  }

  async awardBadge(userId: string, badge: string) {
    if (!badge?.trim()) throw new BadRequestException('Badge is required');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { badges: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.badges.includes(badge)) return { success: true, badges: user.badges };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { badges: { push: badge } },
      select: { badges: true },
    });
    return { success: true, badges: updated.badges };
  }

  async setVerified(userId: string, verified: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { verified } });
    return { success: true, verified };
  }

  /** Maps the UI's action names onto ReportStatus. */
  async resolveReport(reportId: string, action: string) {
    const status = action === 'dismiss' ? 'DISMISSED' : 'RESOLVED';
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    // 'ban' and 'warn' act on the reported user as well as closing the report
    if (action === 'ban') {
      await this.prisma.user.updateMany({ where: { id: report.targetId }, data: { isActive: false } });
    } else if (action === 'warn') {
      await this.prisma.user.updateMany({
        where: { id: report.targetId },
        data: { trustScore: { decrement: 10 } },
      });
    }

    await this.prisma.report.update({ where: { id: reportId }, data: { status: status as any } });
    return { success: true, status };
  }

  async getReports() {
    return this.prisma.report.findMany({
      include: { reporter: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateReport(id: string, status: string) {
    return this.prisma.report.update({ where: { id }, data: { status: status as any } });
  }
}
