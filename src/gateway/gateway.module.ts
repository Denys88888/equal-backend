import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { CallsController } from './calls.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';

@Module({
  // AuthModule re-exports JwtModule, so the gateway can verify handshake tokens.
  // UsersModule provides PushService, which rings a callee who has the app closed.
  imports: [AuthModule, PrismaModule, UsersModule],
  controllers: [CallsController],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class GatewayModule {}
