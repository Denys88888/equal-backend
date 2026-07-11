import { Injectable } from '@nestjs/common';
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
    return this.prisma.user.findMany({
      select: { id: true, name: true, email: true, trustScore: true, verified: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getReports() {
    return this.prisma.report.findMany({
      include: { reporter: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async updateReport(id: string, status: string) {
    const VALID: string[] = ['PENDING', 'RESOLVED', 'DISMISSED'];
    const normalized = status.toUpperCase();
    if (!VALID.includes(normalized)) throw new Error(`Invalid report status: ${status}`);
    return this.prisma.report.update({
      where: { id },
      data: { status: normalized as 'PENDING' | 'RESOLVED' | 'DISMISSED' },
    });
  }

  async setUserActive(id: string, isActive: boolean) {
    return this.prisma.user.update({ where: { id }, data: { isActive } });
  }
}
