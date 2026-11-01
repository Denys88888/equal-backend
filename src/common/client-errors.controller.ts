import { Body, Controller, Headers, HttpCode, OnModuleInit, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CLIENT_ERRORS_KEY, clientErrorDiagnostics, recordClientError, restoreClientErrors } from './client-errors';
import { PrismaService } from '../prisma/prisma.service';

class ClientErrorDto {
  @IsIn(['render', 'error', 'rejection', 'chunk', 'restart'])
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
export class ClientErrorsController implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: CLIENT_ERRORS_KEY } }).catch(() => null);
    restoreClientErrors(row?.value);
  }

  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async report(@Body() body: ClientErrorDto, @Headers('user-agent') userAgent?: string) {
    recordClientError(body, userAgent);
    const value = JSON.stringify(clientErrorDiagnostics());
    await this.prisma.appSetting
      .upsert({ where: { key: CLIENT_ERRORS_KEY }, update: { value }, create: { key: CLIENT_ERRORS_KEY, value } })
      .catch(() => { /* the report still shows until the next restart */ });
  }
}
