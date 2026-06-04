import { IsNumber, IsString, IsNotEmpty, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Payment amount in Pi', minimum: 0.01, maximum: 100 })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  amount!: number;

  @ApiProperty({ description: 'Payment memo/description' })
  @IsString()
  @IsNotEmpty()
  memo!: string;

  @ApiProperty({ description: 'Match ID associated with the payment' })
  @IsString()
  @IsNotEmpty()
  matchId!: string;
}
