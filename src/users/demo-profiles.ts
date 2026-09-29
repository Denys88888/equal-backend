import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Only prisma/seed.ts creates accounts with a `pilot_` Pi uid — a real Pi
 * login always carries Pi's own uid — so this selects the seeded team
 * profiles and nothing else.
 */
export const DEMO_PROFILE_WHERE = { piUid: { startsWith: 'pilot_' } } as const;

/**
 * Marks the seeded pilot profiles as fake on every start.
 *
 * The seed is not wired into `prisma db seed` (package.json has no prisma.seed
 * entry), so it has not run on deploy for a long time and could not be relied
 * on to update the existing pilots. Doing it here is idempotent and touches
 * only those accounts: never verified (they used to wear the verified badge),
 * always isDemo (so the app shows a "Fake" badge).
 */
@Injectable()
export class DemoProfilesBootstrap implements OnApplicationBootstrap {
  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.markDemoProfiles();
    } catch (err) {
      console.error('[demo-profiles] marking failed', err);
    }
  }

  async markDemoProfiles() {
    const res = await this.prisma.user.updateMany({
      where: { ...DEMO_PROFILE_WHERE, OR: [{ isDemo: false }, { verified: true }] },
      data: { isDemo: true, verified: false },
    });
    if (res.count > 0) console.error(`[demo-profiles] marked ${res.count} seeded profiles as fake`);
    return res.count;
  }
}
