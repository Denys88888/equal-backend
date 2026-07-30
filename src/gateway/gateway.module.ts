import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  // AuthModule re-exports JwtModule, so the gateway can verify handshake tokens.
  imports: [AuthModule, PrismaModule],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
