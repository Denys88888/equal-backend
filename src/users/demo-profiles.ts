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
 * Profiles not listed keep their illustrated avatar. Ania onwards were made
 * with Grok Imagine (2026-10-04/05).
 */
export const DEMO_PHOTOS: Record<string, string> = {
  natalia_pilot: './avatar-ava.jpg',          // bookshop regular
  aleksandra_pilot: './avatar-emma.jpg',      // illustrator
  kasia_pilot: './avatar-olivia.jpg',         // yoga instructor
  zofia_pilot: './avatar-sarah.jpg',          // café, coffee
  ola_pilot: './avatar-sophia.jpg',           // photographer
  ania_pilot: './avatar-ania.jpg',            // salsa on weekends
  marta_pilot: './avatar-marta.jpg',          // home cook, pierogi
  weronika_pilot: './avatar-weronika.jpg',    // art student, film festival
  julia_pilot: './avatar-julia.jpg',          // personal trainer
  magda_pilot: './avatar-magda.jpg',          // product designer
  ewa_pilot: './avatar-ewa.jpg',              // weekend hiker
  karolina_pilot: './avatar-karolina.jpg',    // ballroom dancer
  paulina_pilot: './avatar-paulina.jpg',      // yoga teacher
  dominika_pilot: './avatar-dominika.jpg',    // film buff
  klaudia_pilot: './avatar-klaudia.jpg',      // stylist
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
const MAX_MALE_PILOTS = 20;

@Injectable()
export class DemoProfilesBootstrap implements OnApplicationBootstrap {
  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.removeMalePilots();
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

  /**
   * The seed replaced its 15 male pilots with women, but the seed never runs
   * in production, so the men were still there. The owner asked for them to
   * be deleted (2026-10-05). Only seeded fakes whose profile says male are
   * touched; more than 20 would mean the filter is wrong, so nothing is
   * deleted then. Their sent messages go first: Message.sender has no
   * cascade and would block the delete.
   */
  async removeMalePilots() {
    const men = await this.prisma.user.findMany({
      where: {
        ...DEMO_PROFILE_WHERE,
        isDemo: true,
        profile: { OR: [{ gender: { equals: 'male', mode: 'insensitive' } }, { gender: { equals: 'man', mode: 'insensitive' } }] },
      },
      select: { id: true, username: true },
    });
    if (men.length === 0) return 0;
    if (men.length > MAX_MALE_PILOTS) {
      console.error(`[demo-profiles] ${men.length} male pilots matched — expected at most ${MAX_MALE_PILOTS}; deleting nothing`);
      return 0;
    }
    const ids = men.map((u) => u.id);
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { senderId: { in: ids } } }),
      this.prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    console.error(`[demo-profiles] deleted ${ids.length} male fake profiles: ${men.map((u) => u.username).join(', ')}`);
    return ids.length;
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
