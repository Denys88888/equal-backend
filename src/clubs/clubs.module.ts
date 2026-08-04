import { Module } from '@nestjs/common';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { GatewayModule } from '../gateway/gateway.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [GatewayModule, UploadModule],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
