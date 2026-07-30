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

  // ── Clubs & events moderation ───────────────────────────

  async getClubs() {
    const clubs = await this.prisma.club.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { members: true, posts: true } } },
    });
    return clubs.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      memberCount: c._count.members,
      postCount: c._count.posts,
      createdAt: c.createdAt,
    }));
  }

  async deleteClub(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw new NotFoundException('Club not found');
    // Members and posts cascade from Club
    await this.prisma.club.delete({ where: { id: clubId } });
    return { success: true };
  }

  async getEvents() {
    const events = await this.prisma.event.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      include: { _count: { select: { rsvps: true } } },
    });
    const now = Date.now();
    return events.map((e) => ({
      id: e.id,
      name: e.title,
      date: e.date,
      location: e.location ?? '',
      attendees: e._count.rsvps,
      featured: e.featured,
      status: e.date.getTime() > now ? 'Upcoming' : 'Past',
    }));
  }

  async deleteEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found');
    await this.prisma.event.delete({ where: { id: eventId } });
    return { success: true };
  }

  async toggleEventFeatured(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { featured: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { featured: !event.featured },
      select: { featured: true },
    });
    return { success: true, featured: updated.featured };
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
    const reports = await this.prisma.report.findMany({
      include: {
        reporter: { select: { name: true, photos: { where: { isMain: true }, take: 1 } } },
        // Without this the admin UI showed a blank "reported user" — there was no
        // target relation, so moderators could not see who a report was about.
        target: { select: { id: true, name: true, photos: { where: { isMain: true }, take: 1 } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const STATUS_LABEL: Record<string, string> = {
      PENDING: 'Pending',
      RESOLVED: 'Resolved',
      DISMISSED: 'Resolved',
    };
    return reports.map((r) => ({
      id: r.id,
      reportedUser: { name: r.target.name, avatar: r.target.photos[0]?.url ?? '' },
      reporter: { name: r.reporter.name, avatar: r.reporter.photos[0]?.url ?? '' },
      targetId: r.targetId,
      reason: r.reason,
      details: r.description ?? '',
      status: STATUS_LABEL[r.status] ?? 'Pending',
      timestamp: r.createdAt,
    }));
  }

  async updateReport(id: string, status: string) {
    return this.prisma.report.update({ where: { id }, data: { status: status as any } });
  }
}
