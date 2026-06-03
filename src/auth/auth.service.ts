import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async register(email: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, password: hash, name: email.split('@')[0], username: `user_${Date.now()}` },
    });
    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  }

  async piLogin(accessToken: string) {
    // Mock Pi verification - in production verify with Pi Platform API
    const piUid = `pi_${accessToken.slice(0, 10)}`;
    let user = await this.prisma.user.findUnique({ where: { piUid } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { piUid, name: `PiUser_${Date.now()}`, username: `pi_${Date.now()}` },
      });
    }
    const token = this.jwt.sign({ sub: user.id, piUid: user.piUid });
    return { token, user: { id: user.id, name: user.name, piUid: user.piUid } };
  }
}
