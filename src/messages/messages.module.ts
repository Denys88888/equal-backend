import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { UsersModule } from '../users/users.module';
import { GatewayModule } from '../gateway/gateway.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [UsersModule, GatewayModule, UploadModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
