import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
    // Reset the internal payments map
    (service as any).payments.clear();
  });

  describe('createPayment', () => {
    it('should create a payment record', () => {
      const payment = service.createPayment('user-1', 1.0, 'Test', 'match-1');
      expect(payment.user_id).toBe('user-1');
      expect(payment.amount).toBe(1.0);
      expect(payment.status).toBe('pending');
      expect(payment.metadata.matchId).toBe('match-1');
      expect(payment.identifier).toBeDefined();
    });
  });

  describe('approvePayment', () => {
    it('should approve pending payment', async () => {
      process.env.PI_API_KEY = 'test-api-key';

      service.createPayment('user-1', 1.0, 'Test', 'match-1');
      const payment = Array.from((service as any).payments.values())[0];

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      ) as any;

      const result = await service.approvePayment(payment.identifier);
      expect(result.approved).toBe(true);
    });

    it('should throw NotFoundException for unknown payment', async () => {
      await expect(service.approvePayment('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getHistory', () => {
    it('should return user payment history', () => {
      service.createPayment('user-1', 1.0, 'Test 1', 'match-1');
      service.createPayment('user-1', 2.0, 'Test 2', 'match-2');
      service.createPayment('user-2', 3.0, 'Test 3', 'match-3');

      const history = service.getHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history.every((p) => p.user_id === 'user-1')).toBe(true);
    });
  });

  describe('findIncompletePayments', () => {
    it('should return only pending payments', () => {
      service.createPayment('user-1', 1.0, 'Test 1', 'match-1');
      service.createPayment('user-1', 2.0, 'Test 2', 'match-2');

      const incomplete = service.findIncompletePayments('user-1');
      expect(incomplete).toHaveLength(2);
      expect(incomplete.every((p) => p.status === 'pending')).toBe(true);
    });
  });
});
