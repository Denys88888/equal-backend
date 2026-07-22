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
  { name: 'Zofia', gender: 'female', interests: ['Coffee', 'Art', 'Travel'], goal: 'Serious relationship', bioCore: 'Gallery curator exploring Warsaw one exhibition at a time.' },
  { name: 'Jakub', gender: 'male', interests: ['Music', 'Coding', 'Hiking'], goal: 'Serious relationship', bioCore: 'Backend dev, weekend hiker, terrible singer in the shower.' },
  { name: 'Kasia', gender: 'female', interests: ['Yoga', 'Books', 'Coffee'], goal: 'Dating', bioCore: 'Yoga instructor with a growing pile of unread novels.' },
  { name: 'Piotr', gender: 'male', interests: ['Football', 'Cooking', 'Travel'], goal: 'Dating', bioCore: 'Amateur chef, worse footballer, always up for a trip.' },
  { name: 'Ola', gender: 'female', interests: ['Photography', 'Fashion', 'Art'], goal: 'Interest-based connections', bioCore: 'Photographer chasing golden hour across the city.' },
  { name: 'Michał', gender: 'male', interests: ['Gaming', 'Tech', 'Music'], goal: 'Not sure yet', bioCore: 'Game dev by trade, synth collector by obsession.' },
  { name: 'Ania', gender: 'female', interests: ['Dancing', 'Travel', 'Fitness'], goal: 'Dating', bioCore: 'Salsa on weekends, spreadsheets on weekdays.' },
  { name: 'Tomasz', gender: 'male', interests: ['Cycling', 'Coffee', 'Books'], goal: 'Serious relationship', bioCore: 'Cyclist who measures cities by their coffee shops.' },
  { name: 'Marta', gender: 'female', interests: ['Cooking', 'Wine', 'Travel'], goal: 'Serious relationship', bioCore: 'Home cook perfecting pierogi recipes, one batch at a time.' },
  { name: 'Kamil', gender: 'male', interests: ['Startups', 'Fitness', 'Reading'], goal: 'Interest-based connections', bioCore: 'Founder of a small startup, gym in the mornings.' },
  { name: 'Weronika', gender: 'female', interests: ['Art', 'Music', 'Cinema'], goal: 'Dating', bioCore: 'Art student who never misses a film festival.' },
  { name: 'Adrian', gender: 'male', interests: ['Hiking', 'Photography', 'Travel'], goal: 'Serious relationship', bioCore: 'Trail runner and amateur landscape photographer.' },
  { name: 'Natalia', gender: 'female', interests: ['Reading', 'Yoga', 'Coffee'], goal: 'Not sure yet', bioCore: 'Bookshop regular, slowly working through the classics.' },
  { name: 'Bartek', gender: 'male', interests: ['Music', 'Gaming', 'Cooking'], goal: 'Dating', bioCore: 'DJ on weekends, decent cook on weekdays.' },
  { name: 'Julia', gender: 'female', interests: ['Fitness', 'Travel', 'Fashion'], goal: 'Serious relationship', bioCore: 'Personal trainer with a serious travel bucket list.' },
  { name: 'Filip', gender: 'male', interests: ['Chess', 'Books', 'Coffee'], goal: 'Interest-based connections', bioCore: 'Chess club regular, always down for deep conversation.' },
  { name: 'Magda', gender: 'female', interests: ['Design', 'Art', 'Coffee'], goal: 'Dating', bioCore: 'Product designer sketching in cafes across the city.' },
  { name: 'Wojciech', gender: 'male', interests: ['Football', 'Travel', 'Music'], goal: 'Serious relationship', bioCore: 'Sports fan, occasional guitarist, frequent flyer.' },
  { name: 'Ewa', gender: 'female', interests: ['Cooking', 'Hiking', 'Books'], goal: 'Serious relationship', bioCore: 'Weekend hiker who always packs too much food.' },
  { name: 'Dawid', gender: 'male', interests: ['Tech', 'Fitness', 'Gaming'], goal: 'Dating', bioCore: 'Product manager, gym enthusiast, casual gamer.' },
  { name: 'Karolina', gender: 'female', interests: ['Dancing', 'Fashion', 'Travel'], goal: 'Interest-based connections', bioCore: 'Ballroom dancer with a closet full of travel souvenirs.' },
  { name: 'Mateusz', gender: 'male', interests: ['Cycling', 'Music', 'Cooking'], goal: 'Not sure yet', bioCore: 'Cyclist and Sunday-morning bread baker.' },
  { name: 'Aleksandra', gender: 'female', interests: ['Art', 'Coffee', 'Books'], goal: 'Serious relationship', bioCore: 'Illustrator, coffee snob, chronic over-reader.' },
  { name: 'Szymon', gender: 'male', interests: ['Startups', 'Travel', 'Photography'], goal: 'Dating', bioCore: 'Building a startup, documenting it all in photos.' },
  { name: 'Paulina', gender: 'female', interests: ['Yoga', 'Fitness', 'Travel'], goal: 'Dating', bioCore: 'Yoga teacher, always planning the next trip.' },
  { name: 'Igor', gender: 'male', interests: ['Music', 'Cooking', 'Books'], goal: 'Serious relationship', bioCore: 'Vinyl collector who cooks like it is a competition.' },
  { name: 'Dominika', gender: 'female', interests: ['Cinema', 'Art', 'Coffee'], goal: 'Interest-based connections', bioCore: 'Film buff, gallery-hopper, coffee-shop regular.' },
  { name: 'Rafał', gender: 'male', interests: ['Hiking', 'Fitness', 'Tech'], goal: 'Not sure yet', bioCore: 'Trail runner and software engineer, in that order.' },
  { name: 'Klaudia', gender: 'female', interests: ['Fashion', 'Dancing', 'Music'], goal: 'Dating', bioCore: 'Stylist by day, dance floor regular by night.' },
  { name: 'Grzegorz', gender: 'male', interests: ['Chess', 'Travel', 'Coffee'], goal: 'Serious relationship', bioCore: 'Slow traveler, slower chess player, fast coffee drinker.' },
];

async function main() {
  console.log('Seeding Warsaw pilot profiles...');

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
