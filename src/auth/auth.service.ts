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
  ): Promise<AuthToken & { user: { id: string; username: string; name: string } }> {
    try {
      // Step 1: Verify token with Pi Platform API
      console.log('[AUTH] Step 1: Token length:', accessToken?.length);
      
      const response = await fetch('https://api.minepi.com/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log('[AUTH] Step 2: Platform API status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('[AUTH] Platform API error:', errorText.substring(0, 200));
        throw new UnauthorizedException('Invalid Pi access token');
      }
      
      const data = await response.json() as { uid: string; username: string };
      console.log('[AUTH] Step 3: Got uid:', data.uid);
      
      const piUser: PiUser = { uid: data.uid, username: data.username };

      // Step 4: Find or create user
      console.log('[AUTH] Step 4: Finding user...');
      let user: User | null = await this.prisma.user.findUnique({
        where: { piUid: piUser.uid },
      });
      console.log('[AUTH] Step 5: User found:', !!user);

      if (!user) {
        console.log('[AUTH] Step 6: Creating user...');
        try {
          user = await this.prisma.user.create({
            data: {
              piUid: piUser.uid,
              name: piUser.username,
              username: piUser.username,
              profile: { create: {} },
            },
          });
          console.log('[AUTH] Step 7: User created:', user.id);
        } catch (dbErr: any) {
          console.error('[AUTH] DB create error:', dbErr.message || dbErr);
          // Fallback: try finding again (race condition)
          user = await this.prisma.user.findUnique({
            where: { piUid: piUser.uid },
          });
          if (!user) throw dbErr;
          console.log('[AUTH] Step 7b: Found user after race:', user.id);
        }
      }

      // Step 8: Sign JWT
      console.log('[AUTH] Step 8: Signing JWT...');
      const token = this.signToken(user);
      console.log('[AUTH] Step 9: SUCCESS!');
      
      return {
        ...token,
        user: { id: user.id, username: user.username, name: user.name },
      };
    } catch (err: any) {
      console.error('[AUTH] FATAL ERROR:', err.constructor.name, '-', err.message || err);
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      // For any other error, throw 500 with details
      throw new UnauthorizedException(`Auth failed: ${err.message || 'unknown'}`);
    }
  }
}
