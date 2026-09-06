import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
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

  /**
   * Nothing in the app could ever set Role.ADMIN: piLogin created everyone as
   * USER, the seed granted nothing and no endpoint promoted anyone — so the
   * admin panel was unreachable for every account, including the developer's.
   *
   * ADMIN_PI_USERNAMES is a comma-separated allowlist of Pi usernames, matched
   * case-insensitively (the real account is "Cherry19899" with a capital C, and
   * a lowercase-only comparison has bitten this project before). It is the
   * source of truth while set: names on it are promoted, admins missing from it
   * are demoted, so revoking access means editing the env var. When the variable
   * is unset or empty, roles are left completely untouched.
   */
  private async syncAdminRole(user: { id: string; role: string }, piUsername: string) {
    const allow = (process.env.ADMIN_PI_USERNAMES ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allow.length === 0) return user as never;

    const desired = allow.includes(piUsername.trim().toLowerCase()) ? 'ADMIN' : 'USER';
    if (user.role === desired) return user as never;

    return (await this.prisma.user.update({
      where: { id: user.id },
      data: { role: desired as 'ADMIN' | 'USER' },
    })) as never;
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
    } else if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    } else if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
      throw new ForbiddenException('Account is temporarily banned');
    }

    user = await this.syncAdminRole(user, piUser.username);

    const access_token = this.jwt.sign({ sub: user.id, piUid: user.piUid, role: user.role });
    return {
      access_token,
      user: { id: user.id, name: user.name, username: user.username, role: user.role },
    };
  }
}
