import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [ChatGateway, PrismaService],
})
export class GatewayModule {}
