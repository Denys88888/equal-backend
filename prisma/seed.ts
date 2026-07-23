import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Pilot profiles for the Warsaw launch market.
 * These are explicitly disclosed in `bio` as Equal team pilot accounts —
 * not real people, no scraped/stock photos of real faces (avoids
 * impersonation and reverse-image-search exposure). Avatars are
 * generated SVG gradient+initial, matching the app's own fallback style.
 */

const GRADIENT_PAIRS: [string, string][] = [
  ['#BB83C9', '#7BC4E8'],
  ['#7DE0B3', '#7BC4E8'],
  ['#F0B84A', '#BB83C9'],
  ['#7BC4E8', '#7DE0B3'],
  ['#BB83C9', '#F0B84A'],
];

function makeAvatar(name: string, seed: number): string {
  const [c1, c2] = GRADIENT_PAIRS[seed % GRADIENT_PAIRS.length];
  const initial = name.charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <text x="200" y="330" font-family="'Outfit', system-ui, sans-serif" font-size="180" font-weight="700" fill="rgba(255,255,255,0.9)" text-anchor="middle">${initial}</text>
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
      console.log(`Skipping ${p.name} — already exists`);
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
