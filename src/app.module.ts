import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerProxyGuard } from './throttler-proxy.guard';
import { CommonModule } from './common/common.module';
import { DailyMatchModule } from './daily-match/daily-match.module';
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
import { VerificationModule } from './verification/verification.module';
import { SettingsModule } from './settings/settings.module';
import { GatewayModule } from './gateway/gateway.module';
import { AskModule } from './ask/ask.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // 100 requests / 15 min, matching the spec's express-rate-limit budget.
    ThrottlerModule.forRoot([{ ttl: 15 * 60 * 1000, limit: 100 }]),
    ScheduleModule.forRoot(),
    CommonModule,
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
    VerificationModule,
    SettingsModule,
    GatewayModule,
    DailyMatchModule,
    AskModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerProxyGuard }],
})
export class AppModule {}
