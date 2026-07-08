import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROFILES = [
  {
    name: 'Sophie', username: 'sophie_eq', city: 'Paris',
    bio: 'Art lover, weekend explorer. Looking for someone to share adventures with.',
    interests: ['Art', 'Coffee', 'Travel', 'Cinema'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1494790108755-2616b612b977?w=400&h=600&fit=crop&crop=face',
    birthDate: '1997-03-15', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Marcus', username: 'marcus_eq', city: 'Berlin',
    bio: 'Software engineer by day, musician by night. Coffee enthusiast.',
    interests: ['Music', 'Coding', 'Coffee', 'Hiking'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop&crop=face',
    birthDate: '1994-07-22', gender: 'male', lookingFor: 'female',
  },
  {
    name: 'Yuki', username: 'yuki_eq', city: 'Tokyo',
    bio: 'Photographer and foodie. Always chasing the perfect shot and perfect ramen.',
    interests: ['Photography', 'Food', 'Travel', 'Anime'], goals: ['Dating'],
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&crop=face',
    birthDate: '1999-11-08', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Dmitri', username: 'dmitri_eq', city: 'Moscow',
    bio: 'Chess player and book collector. Looking for deep conversations and laughter.',
    interests: ['Chess', 'Books', 'Philosophy', 'Cooking'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=600&fit=crop&crop=face',
    birthDate: '1993-05-30', gender: 'male', lookingFor: 'female',
  },
  {
    name: 'Amara', username: 'amara_eq', city: 'Lagos',
    bio: 'Entrepreneur and dancer. Life is too short for boring conversations!',
    interests: ['Dancing', 'Business', 'Travel', 'Fashion'], goals: ['Dating'],
    photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=600&fit=crop&crop=face',
    birthDate: '1998-09-12', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Carlos', username: 'carlos_eq', city: 'Madrid',
    bio: 'Chef and salsa dancer. I cook, therefore I am.',
    interests: ['Cooking', 'Dancing', 'Football', 'Music'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&h=600&fit=crop&crop=face',
    birthDate: '1992-01-19', gender: 'male', lookingFor: 'female',
  },
  {
    name: 'Priya', username: 'priya_eq', city: 'Mumbai',
    bio: 'Doctor with a passion for yoga and classical music. Seeker of balance.',
    interests: ['Yoga', 'Music', 'Medicine', 'Books'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop&crop=face',
    birthDate: '1996-04-25', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Leo', username: 'leo_eq', city: 'São Paulo',
    bio: 'Graphic designer, surfer, and vinyl record collector. Good vibes only.',
    interests: ['Design', 'Surfing', 'Music', 'Art'], goals: ['Dating'],
    photo: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=600&fit=crop&crop=face',
    birthDate: '1995-08-03', gender: 'male', lookingFor: 'female',
  },
  {
    name: 'Elena', username: 'elena_eq', city: 'Kyiv',
    bio: 'Literature teacher and amateur poet. Hiking trails and bookshop corners.',
    interests: ['Literature', 'Hiking', 'Poetry', 'Coffee'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=600&fit=crop&crop=face',
    birthDate: '1997-12-01', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Kwame', username: 'kwame_eq', city: 'Accra',
    bio: 'Architect with a love for jazz, street food, and late-night city walks.',
    interests: ['Architecture', 'Jazz', 'Travel', 'Food'], goals: ['Dating'],
    photo: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=400&h=600&fit=crop&crop=face',
    birthDate: '1991-06-17', gender: 'male', lookingFor: 'female',
  },
  {
    name: 'Mia', username: 'mia_eq', city: 'Amsterdam',
    bio: 'Freelance journalist, cycling everywhere, plant parent of 30+ plants.',
    interests: ['Writing', 'Cycling', 'Plants', 'Coffee'], goals: ['Serious relationship'],
    photo: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=600&fit=crop&crop=face',
    birthDate: '1998-02-14', gender: 'female', lookingFor: 'male',
  },
  {
    name: 'Arjun', username: 'arjun_eq', city: 'Bangalore',
    bio: 'Startup founder, weekend trekker, terrible at cooking but great at ordering.',
    interests: ['Startups', 'Trekking', 'Technology', 'Cricket'], goals: ['Dating'],
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=600&fit=crop&crop=face',
    birthDate: '1993-10-09', gender: 'male', lookingFor: 'female',
  },
];

async function main() {
  console.log('Seeding database with demo profiles...');

  for (const p of PROFILES) {
    const existing = await prisma.user.findUnique({ where: { username: p.username } });
    if (existing) {
      console.log(`Skipping ${p.name} — already exists`);
      continue;
    }

    const piUid = `seed_${p.username}`;
    const user = await prisma.user.create({
      data: {
        piUid,
        name: p.name,
        username: p.username,
        verified: true,
        sparkBalance: Math.floor(Math.random() * 50) + 10,
        profile: {
          create: {
            bio: p.bio,
            city: p.city,
            birthDate: new Date(p.birthDate),
            gender: p.gender,
            lookingFor: p.lookingFor,
            interests: p.interests,
            goals: p.goals,
          },
        },
      },
    });

    await prisma.photo.create({
      data: { userId: user.id, url: p.photo, isMain: true, order: 0 },
    });

    console.log(`✓ Created: ${p.name} (${p.city})`);
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
        { title: 'Speed Dating Night', description: 'Meet 10+ matches in one evening!', date: new Date('2026-08-01T19:00:00Z'), location: 'The Social Hub, NYC', category: 'Social', attendeeCount: 24 },
        { title: 'Sunset Hike & Picnic', description: 'Scenic hike followed by a group picnic.', date: new Date('2026-08-15T17:00:00Z'), location: 'Lands End Trail, SF', category: 'Outdoor', attendeeCount: 18 },
        { title: 'Pi Pioneers Meetup', description: 'IRL meetup for Pi Network community members.', date: new Date('2026-09-01T14:00:00Z'), location: 'WeWork, Berlin', category: 'Community', attendeeCount: 62 },
      ],
    });
  }

  console.log('\nSeeding complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
