import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding...');

  const user1 = await prisma.user.create({
    data: {
      email: 'alex@equal.app',
      name: 'Alex',
      username: 'alex_eq',
      trustScore: 85,
      sparkBalance: 25,
      verified: true,
      profile: {
        create: {
          bio: 'Coffee lover, hiking enthusiast',
          city: 'San Francisco',
          interests: ['Hiking', 'Coffee', 'Photography'],
          goals: ['Serious relationship'],
        },
      },
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'sarah@equal.app',
      name: 'Sarah',
      username: 'sarah_eq',
      trustScore: 92,
      sparkBalance: 40,
      verified: true,
      profile: {
        create: {
          bio: 'Art lover, weekend explorer',
          city: 'San Francisco',
          interests: ['Art', 'Coffee', 'Travel'],
          goals: ['Serious relationship'],
        },
      },
    },
  });

  await prisma.match.create({
    data: { user1Id: user1.id, user2Id: user2.id },
  });

  await prisma.message.createMany({
    data: [
      { matchId: (await prisma.match.findFirst())!.id, senderId: user2.id, content: 'Hey Alex! Love your photos!' },
      { matchId: (await prisma.match.findFirst())!.id, senderId: user1.id, content: 'Hi Sarah! Thanks, you too!' },
    ],
  });

  await prisma.club.createMany({
    data: [
      { name: 'Hiking Enthusiasts', description: 'For trail lovers', category: 'Sports', icon: '⛰️' },
      { name: 'Coffee Connoisseurs', description: 'Best coffee shops', category: 'Food', icon: '☕' },
      { name: 'Photography Lovers', description: 'Share your shots', category: 'Art', icon: '📸' },
    ],
  });

  await prisma.event.createMany({
    data: [
      { title: 'Speed Dating Night', description: 'Meet 10+ matches!', date: new Date('2025-07-01T19:00:00Z'), location: 'The Social Hub, SF', category: 'Social' },
      { title: 'Sunset Hike & Picnic', description: 'Scenic hike + picnic', date: new Date('2025-07-15T17:00:00Z'), location: 'Lands End Trail, SF', category: 'Outdoor' },
    ],
  });

  console.log('Seed complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
