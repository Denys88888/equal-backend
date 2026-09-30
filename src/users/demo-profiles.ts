import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Only prisma/seed.ts creates accounts with a `pilot_` Pi uid — a real Pi
 * login always carries Pi's own uid — so this selects the seeded team
 * profiles and nothing else.
 */
export const DEMO_PROFILE_WHERE = { piUid: { startsWith: 'pilot_' } } as const;

/**
 * Photo portraits for the fake profiles whose bio they fit. They are the
 * AI-generated images bundled with the frontend (public/avatar-*.jpg), not
 * photos of real people — a real person's face must never be put on a fake
 * dating profile. Relative so they load from whichever host serves the app.
 * Profiles not listed keep their illustrated avatar.
 */
export const DEMO_PHOTOS: Record<string, string> = {
  natalia_pilot: './avatar-ava.jpg',       // bookshop regular
  aleksandra_pilot: './avatar-emma.jpg',   // illustrator
  kasia_pilot: './avatar-olivia.jpg',      // yoga instructor
  zofia_pilot: './avatar-sarah.jpg',       // café, coffee
  ola_pilot: './avatar-sophia.jpg',        // photographer
};

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
      await this.applyDemoPhotos();
    } catch (err) {
      console.error('[demo-profiles] marking failed', err);
    }
  }

  /** Put each listed fake profile's portrait in as its main photo. */
  async applyDemoPhotos() {
    let changed = 0;
    for (const [username, url] of Object.entries(DEMO_PHOTOS)) {
      const user = await this.prisma.user.findFirst({
        where: { ...DEMO_PROFILE_WHERE, username },
        select: { id: true },
      });
      if (!user) continue;
      const main = await this.prisma.photo.findFirst({ where: { userId: user.id, isMain: true } });
      if (main?.url === url) continue;
      if (main) await this.prisma.photo.update({ where: { id: main.id }, data: { url } });
      else await this.prisma.photo.create({ data: { userId: user.id, url, isMain: true, order: 0 } });
      changed++;
    }
    if (changed > 0) console.error(`[demo-profiles] set ${changed} portrait photos`);
    return changed;
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
