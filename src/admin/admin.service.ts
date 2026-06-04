import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, ReportStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async findUsers(
    page: number,
    limit: number,
    search?: string,
  ): Promise<{
    data: Array<{
      id: string;
      name: string;
      username: string;
      role: Role;
      verified: boolean;
      isActive: boolean;
      trustScore: number;
      createdAt: Date;
    }>;
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const skip: number = (page - 1) * limit;

    const whereClause: {
      OR?: Array<
        | { name: { contains: string; mode: 'insensitive' } }
        | { piUid: { contains: string; mode: 'insensitive' } }
        | { username: { contains: string; mode: 'insensitive' } }
      >;
    } = {};

    if (search && search.trim().length > 0) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { piUid: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total]: [
      Array<{
        id: string;
        name: string;
        username: string;
        role: Role;
        verified: boolean;
        isActive: boolean;
        trustScore: number;
        createdAt: Date;
      }>,
      number,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          verified: true,
          isActive: true,
          trustScore: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserById(id: string): Promise<{
    id: string;
    name: string;
    username: string;
    role: Role;
    verified: boolean;
    isActive: boolean;
    trustScore: number;
    sparkBalance: number;
    createdAt: Date;
    profile: {
      bio: string | null;
      birthDate: Date | null;
      city: string | null;
      gender: string | null;
      lookingFor: string[];
      interests: string[];
      completionPercent: number;
      profileComplete: boolean;
    } | null;
    photos: Array<{ id: string; url: string; isMain: boolean; order: number }>;
  }> {
    const user: {
      id: string;
      name: string;
      username: string;
      role: Role;
      verified: boolean;
      isActive: boolean;
      trustScore: number;
      sparkBalance: number;
      createdAt: Date;
      profile: {
        bio: string | null;
        birthDate: Date | null;
        city: string | null;
        gender: string | null;
        lookingFor: string[];
        interests: string[];
        completionPercent: number;
        profileComplete: boolean;
      } | null;
      photos: Array<{
        id: string;
        url: string;
        isMain: boolean;
        order: number;
      }>;
    } | null = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        verified: true,
        isActive: true,
        trustScore: true,
        sparkBalance: true,
        createdAt: true,
        profile: {
          select: {
            bio: true,
            birthDate: true,
            city: true,
            gender: true,
            lookingFor: true,
            interests: true,
            completionPercent: true,
            profileComplete: true,
          },
        },
        photos: {
          select: {
            id: true,
            url: true,
            isMain: true,
            order: true,
          },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return user;
  }

  async updateRole(id: string, role: Role): Promise<{ id: string; role: Role }> {
    const user: { id: string; role: Role } = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        role: true,
      },
    });

    return user;
  }

  async toggleVerify(id: string): Promise<{ id: string; verified: boolean }> {
    const existingUser: { verified: boolean } | null =
      await this.prisma.user.findUnique({
        where: { id },
        select: { verified: true },
      });

    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const user: { id: string; verified: boolean } =
      await this.prisma.user.update({
        where: { id },
        data: { verified: !existingUser.verified },
        select: {
          id: true,
          verified: true,
        },
      });

    return user;
  }

  async findReports(): Promise<
    Array<{
      id: string;
      reporterId: string;
      targetId: string;
      reason: string;
      description: string | null;
      status: string;
      createdAt: Date;
    }>
  > {
    const reports: Array<{
      id: string;
      reporterId: string;
      targetId: string;
      reason: string;
      description: string | null;
      status: string;
      createdAt: Date;
    }> = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return reports;
  }

  async resolveReport(id: string): Promise<{ id: string; status: string }> {
    const report: { id: string; status: ReportStatus } =
      await this.prisma.report.update({
        where: { id },
        data: { status: ReportStatus.RESOLVED },
        select: {
          id: true,
          status: true,
        },
      });

    return { id: report.id, status: report.status };
  }

  async dismissReport(id: string): Promise<{ id: string; status: string }> {
    const report: { id: string; status: ReportStatus } =
      await this.prisma.report.update({
        where: { id },
        data: { status: ReportStatus.DISMISSED },
        select: {
          id: true,
          status: true,
        },
      });

    return { id: report.id, status: report.status };
  }

  async getStats(): Promise<{
    totalUsers: number;
    totalMatches: number;
    totalMessages: number;
    totalReports: number;
    pendingReports: number;
  }> {
    const [
      totalUsers,
      totalMatches,
      totalMessages,
      totalReports,
      pendingReports,
    ]: [number, number, number, number, number] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.match.count(),
      this.prisma.message.count(),
      this.prisma.report.count(),
      this.prisma.report.count({
        where: { status: ReportStatus.PENDING },
      }),
    ]);

    return {
      totalUsers,
      totalMatches,
      totalMessages,
      totalReports,
      pendingReports,
    };
  }
}
