import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { recordClientError } from './client-errors';

class ClientErrorDto {
  @IsIn(['render', 'error', 'rejection', 'chunk'])
  kind!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  where?: string;
}

/**
 * Where the app reports a crash (see client-errors.ts). Open without a login:
 * the app can break before anyone is signed in.
 */
@Controller('client-errors')
export class ClientErrorsController {
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@Body() body: ClientErrorDto, @Headers('user-agent') userAgent?: string) {
    recordClientError(body, userAgent);
  }
}
