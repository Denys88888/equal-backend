import {
  Module,
  APP_GUARD,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { DiscoverModule } from './discover/discover.module';
import { MatchesModule } from './matches/matches.module';
import { MessagesModule } from './messages/messages.module';
import { ClubsModule } from './clubs/clubs.module';
import { EventsModule } from './events/events.module';
import { SparksModule } from './sparks/sparks.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { SanitizationMiddleware } from './common/middleware/sanitization.middleware';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 100 }, // General: 100 req/min
      { ttl: 1000, limit: 10, name: 'short' }, // Burst: 10 req/sec
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'equal-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    DiscoverModule,
    MatchesModule,
    MessagesModule,
    ClubsModule,
    EventsModule,
    SparksModule,
    PaymentsModule,
    AdminModule,
    GatewayModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SanitizationMiddleware).forRoutes('*');
  }
}
