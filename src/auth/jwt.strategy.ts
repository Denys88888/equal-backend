import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  piUid: string;
  role: Role;
}

export interface AuthenticatedUser {
  userId: string;
  piUid: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'equal-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    return { userId: payload.sub, piUid: payload.piUid, role: payload.role };
  }
}
