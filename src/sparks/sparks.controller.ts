import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparksService, SparkActivityType } from './sparks.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

class EarnSparksDto {
  activityType: SparkActivityType;
}

class SpendSparksDto {
  amount: number;
  reason: string;
}

interface SparkTransaction {
  id: string;
  activityType: SparkActivityType;
  amount: number;
  createdAt: Date;
}

@Controller('sparks')
@UseGuards(JwtAuthGuard)
export class SparksController {
  constructor(private readonly sparksService: SparksService) {}

  @Get('balance')
  async getBalance(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ sparkBalance: number }> {
    const balance: number = await this.sparksService.getBalance(
      req.user.userId,
    );
    return { sparkBalance: balance };
  }

  @Post('earn')
  async earnSparks(
    @Body() dto: EarnSparksDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; newBalance: number }> {
    const newBalance: number = await this.sparksService.earnSparks(
      req.user.userId,
      dto.activityType,
    );
    return { success: true, newBalance };
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ transactions: SparkTransaction[] }> {
    const transactions: SparkTransaction[] =
      await this.sparksService.getTransactions(req.user.userId);
    return { transactions };
  }

  @Post('spend')
  async spendSparks(
    @Body() dto: SpendSparksDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean; newBalance: number; reason: string }> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    const newBalance: number = await this.sparksService.spendSparks(
      req.user.userId,
      dto.amount,
      dto.reason,
    );
    return { success: true, newBalance, reason: dto.reason };
  }
}
