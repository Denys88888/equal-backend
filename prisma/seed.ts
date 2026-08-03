import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Pilot profiles for the Warsaw launch market.
 * These are explicitly disclosed in `bio` as Equal team pilot accounts —
 * not real people. Avatars are generated flat-illustration busts (hair style +
 * skin tone + background vary per profile), not photos: deliberately not
 * photorealistic, so nobody could mistake a pilot card for a real match, and
 * there's no real person's likeness involved (no impersonation, nothing a
 * reverse-image search could expose as stolen).
 */

const GRADIENT_PAIRS: [string, string][] = [
  ['#BB83C9', '#7BC4E8'],
  ['#7DE0B3', '#7BC4E8'],
  ['#F0B84A', '#BB83C9'],
  ['#7BC4E8', '#7DE0B3'],
  ['#BB83C9', '#F0B84A'],
];

const SKIN_TONES = ['#F2C9A0', '#E8B48A', '#C68863', '#8D5A3B', '#6B4028'];

const HAIR_COLORS = ['#2B1B12', '#4A2E1E', '#7A4A2B', '#B87333', '#1C1C1E', '#D9A441'];

/** Hair silhouettes, drawn behind + around the head oval. Purely illustrative shapes. */
const HAIR_STYLES: ((hx: number, hy: number, hr: number, color: string) => string)[] = [
  // Long straight, past shoulders
  (hx, hy, hr, c) => `
    <path d="M ${hx - hr - 6} ${hy - hr * 0.2} Q ${hx - hr - 14} ${hy + hr * 2.6} ${hx - hr * 0.4} ${hy + hr * 2.8}
             L ${hx - hr * 0.4} ${hy + hr * 0.6} Q ${hx - hr * 0.4} ${hy - hr * 1.15} ${hx} ${hy - hr * 1.2}
             Q ${hx + hr * 0.4} ${hy - hr * 1.15} ${hx + hr * 0.4} ${hy + hr * 0.6}
             L ${hx + hr * 0.4} ${hy + hr * 2.8} Q ${hx + hr + 14} ${hy + hr * 2.6} ${hx + hr + 6} ${hy - hr * 0.2}
             Q ${hx} ${hy - hr * 1.55} ${hx - hr - 6} ${hy - hr * 0.2} Z" fill="${c}"/>`,
  // Shoulder-length bob with inward curl
  (hx, hy, hr, c) => `
    <path d="M ${hx - hr - 4} ${hy - hr * 0.1} Q ${hx - hr - 10} ${hy + hr * 1.5} ${hx - hr * 0.55} ${hy + hr * 1.35}
             Q ${hx - hr * 0.55} ${hy - hr * 1.2} ${hx} ${hy - hr * 1.25}
             Q ${hx + hr * 0.55} ${hy - hr * 1.2} ${hx + hr * 0.55} ${hy + hr * 1.35}
             Q ${hx + hr + 10} ${hy + hr * 1.5} ${hx + hr + 4} ${hy - hr * 0.1}
             Q ${hx} ${hy - hr * 1.6} ${hx - hr - 4} ${hy - hr * 0.1} Z" fill="${c}"/>`,
  // High ponytail
  (hx, hy, hr, c) => `
    <path d="M ${hx - hr - 2} ${hy - hr * 0.05} Q ${hx - hr - 6} ${hy + hr * 0.9} ${hx - hr * 0.6} ${hy + hr * 0.85}
             Q ${hx - hr * 0.6} ${hy - hr * 1.2} ${hx} ${hy - hr * 1.25}
             Q ${hx + hr * 0.6} ${hy - hr * 1.2} ${hx + hr * 0.6} ${hy + hr * 0.85}
             Q ${hx + hr + 6} ${hy + hr * 0.9} ${hx + hr + 2} ${hy - hr * 0.05}
             Q ${hx} ${hy - hr * 1.55} ${hx - hr - 2} ${hy - hr * 0.05} Z" fill="${c}"/>
    <path d="M ${hx + hr * 0.55} ${hy - hr * 0.85} Q ${hx + hr * 1.7} ${hy - hr * 0.5} ${hx + hr * 1.5} ${hy + hr * 1.4}
             Q ${hx + hr * 1.15} ${hy + hr * 0.6} ${hx + hr * 0.55} ${hy - hr * 0.85} Z" fill="${c}"/>`,
  // Curly, wide silhouette
  (hx, hy, hr, c) => `
    <path d="M ${hx - hr - 16} ${hy - hr * 0.1}
             Q ${hx - hr - 20} ${hy + hr * 0.7} ${hx - hr - 4} ${hy + hr * 1.6}
             Q ${hx - hr * 0.5} ${hy + hr * 1.35} ${hx - hr * 0.5} ${hy - hr * 1.2}
             Q ${hx} ${hy - hr * 1.5} ${hx + hr * 0.5} ${hy - hr * 1.2}
             Q ${hx + hr * 0.5} ${hy + hr * 1.35} ${hx + hr + 4} ${hy + hr * 1.6}
             Q ${hx + hr + 20} ${hy + hr * 0.7} ${hx + hr + 16} ${hy - hr * 0.1}
             Q ${hx} ${hy - hr * 1.75} ${hx - hr - 16} ${hy - hr * 0.1} Z" fill="${c}"/>`,
  // Short pixie with side-swept fringe
  (hx, hy, hr, c) => `
    <path d="M ${hx - hr - 2} ${hy + hr * 0.1} Q ${hx - hr - 8} ${hy - hr * 0.55} ${hx - hr * 0.5} ${hy - hr * 0.55}
             Q ${hx - hr * 0.2} ${hy - hr * 1.35} ${hx + hr * 0.35} ${hy - hr * 1.2}
             Q ${hx + hr * 0.9} ${hy - hr * 1.05} ${hx + hr * 0.6} ${hy - hr * 0.5}
             Q ${hx + hr + 6} ${hy - hr * 0.3} ${hx + hr + 2} ${hy + hr * 0.15}
             Q ${hx} ${hy - hr * 1.05} ${hx - hr - 2} ${hy + hr * 0.1} Z" fill="${c}"/>`,
];

/**
 * A flat-illustration bust portrait: gradient background, oval head + neck +
 * shoulders in a skin tone, a hair silhouette, and minimal facial marks (eyes,
 * a soft smile). Deterministic per name so re-seeding doesn't reshuffle looks.
 */
function makeAvatar(name: string, seed: number): string {
  const [c1, c2] = GRADIENT_PAIRS[seed % GRADIENT_PAIRS.length];
  const skin = SKIN_TONES[seed % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(seed + 2) % HAIR_COLORS.length];
  const hairStyle = HAIR_STYLES[seed % HAIR_STYLES.length];

  const hx = 200; // head center x
  const hy = 250; // head center y
  const hr = 78;  // head radius

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <!-- shoulders / top -->
    <path d="M 60 600 Q 60 430 200 430 Q 340 430 340 600 Z" fill="rgba(255,255,255,0.85)"/>
    <!-- neck -->
    <rect x="${hx - 24}" y="${hy + hr - 20}" width="48" height="60" fill="${skin}"/>
    <!-- hair (back layer) -->
    ${hairStyle(hx, hy, hr, hairColor)}
    <!-- head -->
    <circle cx="${hx}" cy="${hy}" r="${hr}" fill="${skin}"/>
    <!-- eyes -->
    <ellipse cx="${hx - 26}" cy="${hy + 4}" rx="7" ry="9" fill="#2B1B12"/>
    <ellipse cx="${hx + 26}" cy="${hy + 4}" rx="7" ry="9" fill="#2B1B12"/>
    <!-- smile -->
    <path d="M ${hx - 22} ${hy + 34} Q ${hx} ${hy + 50} ${hx + 22} ${hy + 34}" stroke="#8B4A3A" stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- blush -->
    <ellipse cx="${hx - 42}" cy="${hy + 22}" rx="10" ry="6" fill="rgba(232,106,106,0.25)"/>
    <ellipse cx="${hx + 42}" cy="${hy + 22}" rx="10" ry="6" fill="rgba(232,106,106,0.25)"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const PILOT_TAG = ' — Equal pilot profile 🚀';

const NAMES: { name: string; gender: 'female' | 'male'; interests: string[]; goal: string; bioCore: string }[] = [
  { name: 'Zofia',      gender: 'female', interests: ['Coffee', 'Art', 'Travel'],           goal: 'Serious relationship',         bioCore: 'Gallery curator exploring Warsaw one exhibition at a time.' },
  { name: 'Kasia',      gender: 'female', interests: ['Yoga', 'Books', 'Coffee'],            goal: 'Dating',                       bioCore: 'Yoga instructor with a growing pile of unread novels.' },
  { name: 'Ola',        gender: 'female', interests: ['Photography', 'Fashion', 'Art'],      goal: 'Interest-based connections',   bioCore: 'Photographer chasing golden hour across the city.' },
  { name: 'Ania',       gender: 'female', interests: ['Dancing', 'Travel', 'Fitness'],       goal: 'Dating',                       bioCore: 'Salsa on weekends, spreadsheets on weekdays.' },
  { name: 'Marta',      gender: 'female', interests: ['Cooking', 'Wine', 'Travel'],          goal: 'Serious relationship',         bioCore: 'Home cook perfecting pierogi recipes, one batch at a time.' },
  { name: 'Weronika',   gender: 'female', interests: ['Art', 'Music', 'Cinema'],             goal: 'Dating',                       bioCore: 'Art student who never misses a film festival.' },
  { name: 'Natalia',    gender: 'female', interests: ['Reading', 'Yoga', 'Coffee'],          goal: 'Not sure yet',                 bioCore: 'Bookshop regular, slowly working through the classics.' },
  { name: 'Julia',      gender: 'female', interests: ['Fitness', 'Travel', 'Fashion'],       goal: 'Serious relationship',         bioCore: 'Personal trainer with a serious travel bucket list.' },
  { name: 'Magda',      gender: 'female', interests: ['Design', 'Art', 'Coffee'],            goal: 'Dating',                       bioCore: 'Product designer sketching in cafes across the city.' },
  { name: 'Ewa',        gender: 'female', interests: ['Cooking', 'Hiking', 'Books'],         goal: 'Serious relationship',         bioCore: 'Weekend hiker who always packs too much food.' },
  { name: 'Karolina',   gender: 'female', interests: ['Dancing', 'Fashion', 'Travel'],       goal: 'Interest-based connections',   bioCore: 'Ballroom dancer with a closet full of travel souvenirs.' },
  { name: 'Aleksandra', gender: 'female', interests: ['Art', 'Coffee', 'Books'],             goal: 'Serious relationship',         bioCore: 'Illustrator, coffee snob, chronic over-reader.' },
  { name: 'Paulina',    gender: 'female', interests: ['Yoga', 'Fitness', 'Travel'],          goal: 'Dating',                       bioCore: 'Yoga teacher, always planning the next trip.' },
  { name: 'Dominika',   gender: 'female', interests: ['Cinema', 'Art', 'Coffee'],            goal: 'Interest-based connections',   bioCore: 'Film buff, gallery-hopper, coffee-shop regular.' },
  { name: 'Klaudia',    gender: 'female', interests: ['Fashion', 'Dancing', 'Music'],        goal: 'Dating',                       bioCore: 'Stylist by day, dance floor regular by night.' },
  { name: 'Monika',     gender: 'female', interests: ['Running', 'Music', 'Travel'],         goal: 'Serious relationship',         bioCore: 'Half-marathon runner with a playlist for every mood.' },
  { name: 'Agnieszka',  gender: 'female', interests: ['Cooking', 'Books', 'Coffee'],         goal: 'Not sure yet',                 bioCore: 'Cook, reader, coffee-shop explorer.' },
  { name: 'Beata',      gender: 'female', interests: ['Fitness', 'Yoga', 'Photography'],     goal: 'Dating',                       bioCore: 'Pilates coach who photographs everything she loves.' },
  { name: 'Sylwia',     gender: 'female', interests: ['Tech', 'Gaming', 'Music'],            goal: 'Interest-based connections',   bioCore: 'UX designer, casual gamer, live-music devotee.' },
  { name: 'Renata',     gender: 'female', interests: ['Wine', 'Travel', 'Cooking'],          goal: 'Serious relationship',         bioCore: 'Sommelier who has eaten her way across three continents.' },
  { name: 'Izabela',    gender: 'female', interests: ['Art', 'Reading', 'Cinema'],           goal: 'Dating',                       bioCore: 'Museum guide who watches films twice — once for fun.' },
  { name: 'Patrycja',   gender: 'female', interests: ['Startups', 'Fitness', 'Coffee'],      goal: 'Interest-based connections',   bioCore: 'Product lead, early-morning gym person, cold-brew fan.' },
  { name: 'Ewelina',    gender: 'female', interests: ['Hiking', 'Photography', 'Travel'],    goal: 'Serious relationship',         bioCore: 'Mountain hiker who documents every summit.' },
  { name: 'Kamila',     gender: 'female', interests: ['Dancing', 'Fashion', 'Art'],          goal: 'Dating',                       bioCore: 'Contemporary dancer and part-time fashion blogger.' },
  { name: 'Honorata',   gender: 'female', interests: ['Philosophy', 'Books', 'Coffee'],      goal: 'Interest-based connections',   bioCore: 'PhD student in ethics, avid debater, terrible at chess.' },
  { name: 'Wiktoria',   gender: 'female', interests: ['Music', 'Yoga', 'Travel'],            goal: 'Not sure yet',                 bioCore: 'Musician who meditates between gigs.' },
  { name: 'Celina',     gender: 'female', interests: ['Cooking', 'Wine', 'Art'],             goal: 'Serious relationship',         bioCore: 'Pastry chef with a wine pairing for every occasion.' },
  { name: 'Milena',     gender: 'female', interests: ['Fitness', 'Crypto', 'Tech'],          goal: 'Dating',                       bioCore: 'Personal trainer and Pi Network enthusiast.' },
  { name: 'Roksana',    gender: 'female', interests: ['Travel', 'Surfing', 'Music'],         goal: 'Interest-based connections',   bioCore: 'Surfs every summer, plays guitar every winter.' },
  { name: 'Kornelia',   gender: 'female', interests: ['Design', 'Coffee', 'Reading'],        goal: 'Serious relationship',         bioCore: 'Graphic designer who reads on the tram and in cafes.' },
];

async function main() {
  console.log('Seeding Warsaw pilot profiles...');

  // Remove any pilot accounts whose names are no longer in NAMES (e.g. old male pilots)
  const validUsernames = new Set(
    NAMES.map(p => `${p.name.toLowerCase().replace(/[^a-z]/g, '')}_pilot`)
  );
  const stalePilots = await prisma.user.findMany({
    where: { username: { endsWith: '_pilot' } },
    select: { id: true, username: true },
  });
  for (const u of stalePilots) {
    if (!validUsernames.has(u.username)) {
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`🗑  Removed stale pilot: ${u.username}`);
    }
  }

  let i = 0;
  for (const p of NAMES) {
    const username = `${p.name.toLowerCase().replace(/[^a-z]/g, '')}_pilot`;
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      // Refresh the avatar in place — these are bot-controlled pilot accounts,
      // not user-edited profiles, so overwriting their photo on every deploy is
      // safe and is how a new makeAvatar() style actually reaches accounts that
      // were already seeded (the rest of this block only runs for brand-new
      // pilots, so without this an avatar-generator change would silently do
      // nothing for anyone already in the database).
      const mainPhoto = await prisma.photo.findFirst({ where: { userId: existing.id, isMain: true } });
      const newAvatar = makeAvatar(p.name, i);
      if (mainPhoto) {
        await prisma.photo.update({ where: { id: mainPhoto.id }, data: { url: newAvatar } });
      } else {
        await prisma.photo.create({ data: { userId: existing.id, url: newAvatar, isMain: true, order: 0 } });
      }
      console.log(`↻ Refreshed avatar: ${p.name}`);
      i++;
      continue;
    }

    const age = 22 + (i % 14); // spread 22–35
    const birthYear = new Date().getFullYear() - age;

    const user = await prisma.user.create({
      data: {
        piUid: `pilot_${username}`,
        name: p.name,
        username,
        verified: true,
        sparkBalance: Math.floor(Math.random() * 20) + 5,
        profile: {
          create: {
            bio: p.bioCore + PILOT_TAG,
            city: 'Warsaw',
            birthDate: new Date(`${birthYear}-06-15`),
            gender: p.gender,
            lookingFor: p.gender === 'female' ? ['male'] : ['female'],
            interests: p.interests,
            goals: [p.goal],
          },
        },
      },
    });

    await prisma.photo.create({
      data: { userId: user.id, url: makeAvatar(p.name, i), isMain: true, order: 0 },
    });

    console.log(`✓ Created: ${p.name} (Warsaw, pilot)`);
    i++;
  }

  // Clubs
  const clubNames = ['Pi Travelers', 'Pi Foodies', 'Pi Tech'];
  for (const clubName of clubNames) {
    const exists = await prisma.club.findFirst({ where: { name: clubName } });
    if (!exists) {
      await prisma.club.create({
        data: {
          name: clubName,
          description: clubName === 'Pi Travelers' ? 'For Pi Network pioneers who love to explore.' :
                       clubName === 'Pi Foodies' ? 'Share recipes, restaurants, and food adventures.' :
                       'Developers, designers and tech enthusiasts on Pi.',
          category: clubName === 'Pi Travelers' ? 'travel' : clubName === 'Pi Foodies' ? 'food' : 'tech',
          memberCount: Math.floor(Math.random() * 2000) + 500,
          icon: clubName === 'Pi Travelers' ? '✈️' : clubName === 'Pi Foodies' ? '🍜' : '💻',
        },
      });
    }
  }

  // Events
  const eventsExist = await prisma.event.count();
  if (eventsExist === 0) {
    await prisma.event.createMany({
      data: [
        { title: 'Speed Dating Night', description: 'Meet 10+ matches in one evening!', date: new Date('2026-08-01T19:00:00Z'), location: 'Warsaw Old Town', category: 'Social', attendeeCount: 24 },
        { title: 'Vistula Riverside Picnic', description: 'Scenic riverside picnic and games.', date: new Date('2026-08-15T17:00:00Z'), location: 'Vistula Boulevards, Warsaw', category: 'Outdoor', attendeeCount: 18 },
        { title: 'Pi Pioneers Meetup', description: 'IRL meetup for Pi Network community members.', date: new Date('2026-09-01T14:00:00Z'), location: 'Warsaw Spire', category: 'Community', attendeeCount: 62 },
      ],
    });
  }

  console.log('\nSeeding complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
