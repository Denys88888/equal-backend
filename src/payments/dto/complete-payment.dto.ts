import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompletePaymentDto {
  @ApiProperty({ description: 'Blockchain transaction ID' })
  @IsString()
  @IsNotEmpty()
  txid!: string;
}
