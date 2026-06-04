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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SparksService, SparkActivityType } from './sparks.service';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    role: string;
  };
}

class EarnSparksDto {
  activityType!: SparkActivityType;
}

class SpendSparksDto {
  amount!: number;
  reason!: string;
}

interface SparkTransaction {
  id: string;
  activityType: SparkActivityType;
  amount: number;
  createdAt: Date;
}

@ApiTags('Sparks')
@ApiBearerAuth()
@Controller('sparks')
@UseGuards(JwtAuthGuard)
export class SparksController {
  constructor(private readonly sparksService: SparksService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get spark balance' })
  @ApiResponse({ status: 200, description: 'Balance retrieved successfully' })
  async getBalance(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ sparkBalance: number }> {
    const balance: number = await this.sparksService.getBalance(
      req.user.userId,
    );
    return { sparkBalance: balance };
  }

  @Post('earn')
  @ApiOperation({ summary: 'Earn sparks for an activity' })
  @ApiBody({ type: EarnSparksDto })
  @ApiResponse({ status: 201, description: 'Sparks earned successfully' })
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
  @ApiOperation({ summary: 'Get spark transaction history' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTransactions(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ transactions: SparkTransaction[] }> {
    const transactions: SparkTransaction[] =
      await this.sparksService.getTransactions(req.user.userId);
    return { transactions };
  }

  @Post('spend')
  @ApiOperation({ summary: 'Spend sparks' })
  @ApiBody({ type: SpendSparksDto })
  @ApiResponse({ status: 201, description: 'Sparks spent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
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
