import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

const PI_API_BASE = 'https://api.minepi.com';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async piLogin(accessToken: string) {
    const piRes = await fetch(`${PI_API_BASE}/v2/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!piRes.ok) {
      throw new UnauthorizedException('Invalid Pi access token');
    }
    const piUser = await piRes.json() as { uid: string; username: string };

    let user = await this.prisma.user.findUnique({ where: { piUid: piUser.uid } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          piUid: piUser.uid,
          name: piUser.username,
          username: piUser.username,
        },
      });
    }

    const access_token = this.jwt.sign({ sub: user.id, piUid: user.piUid, role: user.role });
    return {
      access_token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    };
  }
}
