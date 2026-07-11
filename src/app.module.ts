import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { MatchesModule } from './matches/matches.module';
import { MessagesModule } from './messages/messages.module';
import { ClubsModule } from './clubs/clubs.module';
import { EventsModule } from './events/events.module';
import { SparksModule } from './sparks/sparks.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { GatewayModule } from './gateway/gateway.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    MatchesModule,
    MessagesModule,
    ClubsModule,
    EventsModule,
    SparksModule,
    PaymentsModule,
    AdminModule,
    GatewayModule,
  ],
})
export class AppModule {}
