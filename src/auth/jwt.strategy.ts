import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET env var is required');

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, isActive: true, bannedUntil: true },
    });
    if (!user) throw new UnauthorizedException();
    // BannedGuard only covers the 3 controllers that opt into it; this runs on
    // every authenticated request, so it's the one place a suspended or
    // temporarily-banned account is actually shut out everywhere.
    if (!user.isActive) throw new UnauthorizedException('Account is deactivated');
    if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException('Account is temporarily banned');
    }
    return user;
  }
}
