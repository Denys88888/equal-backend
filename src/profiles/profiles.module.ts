import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { GatewayModule } from '../gateway/gateway.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [GatewayModule, UsersModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
