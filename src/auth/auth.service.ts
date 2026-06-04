import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { User, Role } from '@prisma/client';

export interface AuthToken {
  access_token: string;
}

export interface JwtPayload {
  sub: string;
  piUid: string;
  role: Role;
}

// Pi Platform API user response
interface PiUser {
  uid: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private signToken(user: User): AuthToken {
    const payload: JwtPayload = {
      sub: user.id,
      piUid: user.piUid,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async piLogin(
    accessToken: string,
    _scopes: string[],
  ): Promise<
    AuthToken & { user: { id: string; username: string; name: string } }
  > {
    // Verify the access token with Pi Platform API
    let piUser: PiUser;
    try {
      const response = await fetch('https://api.minepi.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new UnauthorizedException('Invalid Pi access token');
      }
      const data = (await response.json()) as {
        uid: string;
        username: string;
      };
      piUser = { uid: data.uid, username: data.username };
    } catch {
      throw new UnauthorizedException('Failed to verify Pi access token');
    }

    // Find or create user
    let user: User | null = await this.prisma.user.findUnique({
      where: { piUid: piUser.uid },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          piUid: piUser.uid,
          name: piUser.username,
          username: piUser.username,
          profile: { create: {} },
        },
      });
    }

    return {
      ...this.signToken(user),
      user: { id: user.id, username: user.username, name: user.name },
    };
  }
}
