import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { User, Profile, Role } from '@prisma/client';
import { compareSync, hashSync } from 'bcryptjs';

export interface AuthToken {
  access_token: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
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
      email: user.email ?? '',
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(email: string, password: string): Promise<AuthToken> {
    const existing: User | null = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword: string = hashSync(password, 10);
    const username: string = email.split('@')[0] + Math.floor(Math.random() * 10000);

    const user: User = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: email.split('@')[0],
        username,
        profile: {
          create: {},
        },
      },
    });

    return this.signToken(user);
  }

  async login(email: string, password: string): Promise<AuthToken> {
    const user: User | null = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid: boolean = compareSync(password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signToken(user);
  }

  async piLogin(accessToken: string): Promise<AuthToken> {
    // Mock Pi Network authentication
    // In production, verify the accessToken with Pi Network's API
    const mockPiUid: string = 'pi_' + accessToken.slice(0, 16);

    let user: User | null = await this.prisma.user.findUnique({
      where: { piUid: mockPiUid },
    });

    if (!user) {
      const username: string = 'pi_user_' + Math.floor(Math.random() * 100000);
      user = await this.prisma.user.create({
        data: {
          piUid: mockPiUid,
          name: 'Pi User',
          username,
          profile: {
            create: {},
          },
        },
      });
    }

    return this.signToken(user);
  }
}
