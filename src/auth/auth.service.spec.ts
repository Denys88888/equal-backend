import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const mockJwtService = {
    sign: vi.fn(() => 'test-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  describe('piLogin', () => {
    it('should create new user on first login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'test-id',
        piUid: 'pi-test',
        username: 'testuser',
        name: 'testuser',
        role: 'USER',
      });

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ uid: 'pi-test', username: 'testuser' }),
        }),
      ) as any;

      const result = await service.piLogin('test-token', ['username']);

      expect(result.access_token).toBe('test-token');
      expect(result.user.username).toBe('testuser');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({ ok: false, text: () => Promise.resolve('Invalid') }),
      ) as any;

      await expect(service.piLogin('bad-token', [])).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
