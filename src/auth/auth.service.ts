import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

const PI_API_BASE = 'https://api.minepi.com';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async refresh(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    const access_token = this.jwt.sign({ sub: user.id, piUid: user.piUid, role: user.role });
    return { access_token };
  }

  async piLogin(accessToken: string) {
    let piRes: Response;
    try {
      piRes = await fetch(`${PI_API_BASE}/v2/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new UnauthorizedException('Pi API unreachable');
    }
    if (!piRes.ok) {
      throw new UnauthorizedException('Invalid Pi access token');
    }
    const piUser = await piRes.json() as { uid: string; username: string };

    let user = await this.prisma.user.findUnique({ where: { piUid: piUser.uid } });
    if (!user) {
      // username is unique; the same person may already exist from another
      // network (testnet/mainnet piUids differ) — pick a free variant
      let username = piUser.username;
      const taken = await this.prisma.user.findUnique({ where: { username } });
      if (taken) username = `${piUser.username}_${piUser.uid.slice(0, 6)}`;
      user = await this.prisma.user.create({
        data: {
          piUid: piUser.uid,
          name: piUser.username,
          username,
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
