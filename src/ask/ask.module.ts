import { Module } from '@nestjs/common';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { UsersModule } from '../users/users.module';

@Module({
  // UsersModule for PushService; ProfanityService comes from the global CommonModule.
  imports: [UsersModule],
  controllers: [AskController],
  providers: [AskService],
  exports: [AskService],
})
export class AskModule {}
