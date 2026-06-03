import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, photos: { orderBy: { order: 'asc' } } },
    });
  }

  async update(id: string, data: Record<string, unknown>) {
    const { profile, ...userData } = data;
    if (profile && typeof profile === 'object') {
      await this.prisma.profile.upsert({
        where: { userId: id },
        update: profile as Record<string, unknown>,
        create: { userId: id, ...(profile as Record<string, unknown>) },
      });
    }
    return this.prisma.user.update({ where: { id }, data: userData });
  }
}
