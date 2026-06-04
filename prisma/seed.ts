import { PrismaClient, Role, MessageType, ClubRole, RsvpStatus, ReportStatus } from '@prisma/client';

const prisma: PrismaClient = new PrismaClient();

interface SeedUser {
  id: string;
  email: string;
  password: string;
  name: string;
  username: string;
  avatar: string;
  role: Role;
  verified: boolean;
  trustScore: number;
  sparkBalance: number;
}

interface SeedProfile {
  bio: string;
  birthDate: Date;
  city: string;
  latitude: number;
  longitude: number;
  gender: string;
  lookingFor: string[];
  goals: string[];
  interests: string[];
  completionPercent: number;
  profileComplete: boolean;
}

interface SeedPhoto {
  url: string;
  isMain: boolean;
  order: number;
}

async function main(): Promise<void> {
  console.log('Starting seed...');

  // Clean existing data
  await prisma.report.deleteMany({});
  await prisma.eventRsvp.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.clubPost.deleteMany({});
  await prisma.clubMember.deleteMany({});
  await prisma.club.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.swipeAction.deleteMany({});
  await prisma.photo.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Cleaned existing data');

  // Create 10 sample users with profiles and photos
  const usersData: Array<{
    user: SeedUser;
    profile: SeedProfile;
    photos: SeedPhoto[];
  }> = [
    {
      user: {
        id: 'user_001',
        email: 'alice@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Alice Johnson',
        username: 'alicej',
        avatar: 'https://picsum.photos/seed/alice/200',
        role: Role.ADMIN,
        verified: true,
        trustScore: 85,
        sparkBalance: 120,
      },
      profile: {
        bio: 'Love hiking and photography. Looking for meaningful connections.',
        birthDate: new Date('1995-03-15'),
        city: 'New York',
        latitude: 40.7128,
        longitude: -74.006,
        gender: 'female',
        lookingFor: ['male', 'non-binary'],
        goals: ['relationship', 'friendship'],
        interests: ['hiking', 'photography', 'travel', 'yoga'],
        completionPercent: 90,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/alice1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/alice2/400/600', isMain: false, order: 1 },
      ],
    },
    {
      user: {
        id: 'user_002',
        email: 'bob@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Bob Smith',
        username: 'bobsmith',
        avatar: 'https://picsum.photos/seed/bob/200',
        role: Role.USER,
        verified: true,
        trustScore: 78,
        sparkBalance: 80,
      },
      profile: {
        bio: 'Musician and coffee enthusiast. Lets grab a drink sometime.',
        birthDate: new Date('1993-07-22'),
        city: 'Los Angeles',
        latitude: 34.0522,
        longitude: -118.2437,
        gender: 'male',
        lookingFor: ['female'],
        goals: ['relationship'],
        interests: ['music', 'coffee', 'guitar', 'concerts'],
        completionPercent: 85,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/bob1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/bob2/400/600', isMain: false, order: 1 },
      ],
    },
    {
      user: {
        id: 'user_003',
        email: 'charlie@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Charlie Brown',
        username: 'charlieb',
        avatar: 'https://picsum.photos/seed/charlie/200',
        role: Role.USER,
        verified: false,
        trustScore: 45,
        sparkBalance: 30,
      },
      profile: {
        bio: 'Software developer who loves gaming and tech.',
        birthDate: new Date('1997-11-05'),
        city: 'San Francisco',
        latitude: 37.7749,
        longitude: -122.4194,
        gender: 'male',
        lookingFor: ['female'],
        goals: ['friendship', 'casual'],
        interests: ['gaming', 'coding', 'tech', 'sci-fi'],
        completionPercent: 60,
        profileComplete: false,
      },
      photos: [
        { url: 'https://picsum.photos/seed/charlie1/400/600', isMain: true, order: 0 },
      ],
    },
    {
      user: {
        id: 'user_004',
        email: 'diana@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Diana Prince',
        username: 'dianap',
        avatar: 'https://picsum.photos/seed/diana/200',
        role: Role.USER,
        verified: true,
        trustScore: 92,
        sparkBalance: 200,
      },
      profile: {
        bio: 'Fitness trainer and wellness coach. Living my best life.',
        birthDate: new Date('1994-01-18'),
        city: 'Miami',
        latitude: 25.7617,
        longitude: -80.1918,
        gender: 'female',
        lookingFor: ['male', 'female'],
        goals: ['relationship', 'friendship'],
        interests: ['fitness', 'nutrition', 'beach', 'running'],
        completionPercent: 95,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/diana1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/diana2/400/600', isMain: false, order: 1 },
        { url: 'https://picsum.photos/seed/diana3/400/600', isMain: false, order: 2 },
      ],
    },
    {
      user: {
        id: 'user_005',
        email: 'ethan@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Ethan Hunt',
        username: 'ethanh',
        avatar: 'https://picsum.photos/seed/ethan/200',
        role: Role.USER,
        verified: true,
        trustScore: 70,
        sparkBalance: 55,
      },
      profile: {
        bio: 'Travel junkie and foodie. Always planning the next adventure.',
        birthDate: new Date('1992-09-30'),
        city: 'Chicago',
        latitude: 41.8781,
        longitude: -87.6298,
        gender: 'male',
        lookingFor: ['female'],
        goals: ['relationship'],
        interests: ['travel', 'food', 'adventure', 'cooking'],
        completionPercent: 88,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/ethan1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/ethan2/400/600', isMain: false, order: 1 },
      ],
    },
    {
      user: {
        id: 'user_006',
        email: 'fiona@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Fiona Gallagher',
        username: 'fionag',
        avatar: 'https://picsum.photos/seed/fiona/200',
        role: Role.USER,
        verified: false,
        trustScore: 55,
        sparkBalance: 25,
      },
      profile: {
        bio: 'Art lover and creative soul. Painting is my therapy.',
        birthDate: new Date('1996-05-12'),
        city: 'Portland',
        latitude: 45.5152,
        longitude: -122.6784,
        gender: 'female',
        lookingFor: ['male', 'female', 'non-binary'],
        goals: ['friendship', 'casual'],
        interests: ['art', 'painting', 'gallery', 'design'],
        completionPercent: 72,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/fiona1/400/600', isMain: true, order: 0 },
      ],
    },
    {
      user: {
        id: 'user_007',
        email: 'george@example.com',
        password: '$2b$10$hashedpassword',
        name: 'George Martin',
        username: 'georgem',
        avatar: 'https://picsum.photos/seed/george/200',
        role: Role.USER,
        verified: true,
        trustScore: 80,
        sparkBalance: 90,
      },
      profile: {
        bio: 'Bookworm and history buff. Ask me about medieval history.',
        birthDate: new Date('1991-12-01'),
        city: 'Boston',
        latitude: 42.3601,
        longitude: -71.0589,
        gender: 'male',
        lookingFor: ['female'],
        goals: ['relationship', 'friendship'],
        interests: ['reading', 'history', 'museums', 'chess'],
        completionPercent: 82,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/george1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/george2/400/600', isMain: false, order: 1 },
      ],
    },
    {
      user: {
        id: 'user_008',
        email: 'hannah@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Hannah Montana',
        username: 'hannahm',
        avatar: 'https://picsum.photos/seed/hannah/200',
        role: Role.USER,
        verified: true,
        trustScore: 88,
        sparkBalance: 150,
      },
      profile: {
        bio: 'Music is life. Singer-songwriter looking for inspiration.',
        birthDate: new Date('1998-02-28'),
        city: 'Nashville',
        latitude: 36.1627,
        longitude: -86.7816,
        gender: 'female',
        lookingFor: ['male'],
        goals: ['relationship'],
        interests: ['music', 'singing', 'songwriting', 'guitar'],
        completionPercent: 91,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/hannah1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/hannah2/400/600', isMain: false, order: 1 },
      ],
    },
    {
      user: {
        id: 'user_009',
        email: 'ian@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Ian Somerhalder',
        username: 'ians',
        avatar: 'https://picsum.photos/seed/ian/200',
        role: Role.USER,
        verified: false,
        trustScore: 40,
        sparkBalance: 10,
      },
      profile: {
        bio: 'Dog lover and outdoor enthusiast. Lets go on a hike!',
        birthDate: new Date('1994-08-14'),
        city: 'Denver',
        latitude: 39.7392,
        longitude: -104.9903,
        gender: 'male',
        lookingFor: ['female'],
        goals: ['friendship', 'casual'],
        interests: ['dogs', 'hiking', 'camping', 'sports'],
        completionPercent: 55,
        profileComplete: false,
      },
      photos: [
        { url: 'https://picsum.photos/seed/ian1/400/600', isMain: true, order: 0 },
      ],
    },
    {
      user: {
        id: 'user_010',
        email: 'julia@example.com',
        password: '$2b$10$hashedpassword',
        name: 'Julia Roberts',
        username: 'juliar',
        avatar: 'https://picsum.photos/seed/julia/200',
        role: Role.USER,
        verified: true,
        trustScore: 95,
        sparkBalance: 300,
      },
      profile: {
        bio: 'Film enthusiast and aspiring actress. Living the dream in LA.',
        birthDate: new Date('1993-04-25'),
        city: 'Los Angeles',
        latitude: 34.0522,
        longitude: -118.2437,
        gender: 'female',
        lookingFor: ['male'],
        goals: ['relationship', 'networking'],
        interests: ['movies', 'acting', 'theater', 'fashion'],
        completionPercent: 98,
        profileComplete: true,
      },
      photos: [
        { url: 'https://picsum.photos/seed/julia1/400/600', isMain: true, order: 0 },
        { url: 'https://picsum.photos/seed/julia2/400/600', isMain: false, order: 1 },
        { url: 'https://picsum.photos/seed/julia3/400/600', isMain: false, order: 2 },
      ],
    },
  ];

  for (const data of usersData) {
    const { user, profile, photos } = data;

    await prisma.user.create({
      data: {
        ...user,
        profile: {
          create: profile,
        },
        photos: {
          create: photos,
        },
      },
    });

    console.log(`Created user: ${user.name} (${user.username})`);
  }

  // Create sample matches and messages
  const matchesData: Array<{
    id: string;
    user1Id: string;
    user2Id: string;
    messages: Array<{
      senderId: string;
      content: string;
      type: MessageType;
    }>;
  }> = [
    {
      id: 'match_001',
      user1Id: 'user_001',
      user2Id: 'user_002',
      messages: [
        { senderId: 'user_001', content: 'Hey Bob! Love your music taste 🎸', type: MessageType.TEXT },
        { senderId: 'user_002', content: 'Thanks Alice! Your photos are amazing!', type: MessageType.TEXT },
        { senderId: 'user_001', content: 'Want to grab coffee sometime?', type: MessageType.TEXT },
        { senderId: 'user_002', content: 'Sounds great! How about Saturday?', type: MessageType.TEXT },
      ],
    },
    {
      id: 'match_002',
      user1Id: 'user_004',
      user2Id: 'user_007',
      messages: [
        { senderId: 'user_004', content: 'Hi George! I see you love chess too!', type: MessageType.TEXT },
        { senderId: 'user_007', content: 'Yes! Been playing since I was a kid. You?', type: MessageType.TEXT },
        { senderId: 'user_004', content: 'Just started learning. Would love some tips!', type: MessageType.TEXT },
      ],
    },
    {
      id: 'match_003',
      user1Id: 'user_005',
      user2Id: 'user_008',
      messages: [
        { senderId: 'user_005', content: 'Hey Hannah! Your songs are beautiful', type: MessageType.TEXT },
        { senderId: 'user_008', content: 'Thank you so much! That means a lot 💕', type: MessageType.TEXT },
        { senderId: 'user_005', content: 'Would love to hear you play live sometime', type: MessageType.TEXT },
        { senderId: 'user_008', content: 'I have a gig next Friday downtown!', type: MessageType.TEXT },
        { senderId: 'user_005', content: 'Ill be there! Save me a spot?', type: MessageType.TEXT },
      ],
    },
    {
      id: 'match_004',
      user1Id: 'user_006',
      user2Id: 'user_009',
      messages: [
        { senderId: 'user_006', content: 'Love your dog pics! Whats their name?', type: MessageType.TEXT },
        { senderId: 'user_009', content: 'His name is Max! Hes a golden retriever 🐕', type: MessageType.TEXT },
      ],
    },
  ];

  for (const matchData of matchesData) {
    const { id, user1Id, user2Id, messages } = matchData;

    await prisma.match.create({
      data: {
        id,
        user1Id,
        user2Id,
        messages: {
          create: messages.map((msg) => ({
            ...msg,
          })),
        },
      },
    });

    console.log(`Created match between ${user1Id} and ${user2Id} with ${messages.length} messages`);
  }

  // Create sample swipe actions
  const swipeActionsData: Array<{
    userId: string;
    targetId: string;
    action: string;
  }> = [
    { userId: 'user_001', targetId: 'user_002', action: 'like' },
    { userId: 'user_002', targetId: 'user_001', action: 'like' },
    { userId: 'user_003', targetId: 'user_004', action: 'like' },
    { userId: 'user_004', targetId: 'user_007', action: 'like' },
    { userId: 'user_007', targetId: 'user_004', action: 'like' },
    { userId: 'user_005', targetId: 'user_008', action: 'superlike' },
    { userId: 'user_008', targetId: 'user_005', action: 'like' },
    { userId: 'user_006', targetId: 'user_009', action: 'like' },
    { userId: 'user_009', targetId: 'user_006', action: 'like' },
    { userId: 'user_010', targetId: 'user_002', action: 'pass' },
  ];

  for (const swipe of swipeActionsData) {
    await prisma.swipeAction.create({
      data: swipe,
    });
  }
  console.log(`Created ${swipeActionsData.length} swipe actions`);

  // Create 2 sample clubs
  const clubsData: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    members: Array<{ userId: string; role: ClubRole }>;
    posts: Array<{ authorId: string; content: string }>;
  }> = [
    {
      id: 'club_001',
      name: 'Hiking Enthusiasts',
      description: 'A club for people who love hiking, trail running, and outdoor adventures. Join us for weekly hikes and nature exploration!',
      category: 'outdoor',
      icon: '🥾',
      members: [
        { userId: 'user_001', role: ClubRole.ADMIN },
        { userId: 'user_005', role: ClubRole.MEMBER },
        { userId: 'user_009', role: ClubRole.MEMBER },
      ],
      posts: [
        { authorId: 'user_001', content: 'Just hiked the Appalachian Trail section this weekend. Amazing views! Who wants to join next time?' },
        { authorId: 'user_005', content: 'Planning a trip to Rocky Mountain National Park next month. DM me if interested!' },
        { authorId: 'user_009', content: 'Max loved the trail today! Dogs welcome on this one 🐕' },
      ],
    },
    {
      id: 'club_002',
      name: 'Music Makers',
      description: 'For musicians, singers, producers, and music lovers. Share your work, collaborate, and discover new sounds.',
      category: 'music',
      icon: '🎵',
      members: [
        { userId: 'user_002', role: ClubRole.ADMIN },
        { userId: 'user_008', role: ClubRole.MODERATOR },
        { userId: 'user_001', role: ClubRole.MEMBER },
        { userId: 'user_006', role: ClubRole.MEMBER },
      ],
      posts: [
        { authorId: 'user_002', content: 'Just dropped my new single on SoundCloud. Check it out and let me know what you think!' },
        { authorId: 'user_008', content: 'Hosting an open mic night this Friday at The Bluebird Cafe. Come support local artists!' },
        { authorId: 'user_006', content: 'Looking for a guitarist to collaborate on my art exhibition soundtrack. Any takers?' },
        { authorId: 'user_001', content: 'Captured some amazing photos at the concert last night. The lighting was perfect!' },
      ],
    },
  ];

  for (const clubData of clubsData) {
    const { id, name, description, category, icon, members, posts } = clubData;

    await prisma.club.create({
      data: {
        id,
        name,
        description,
        category,
        icon,
        members: {
          create: members,
        },
        posts: {
          create: posts,
        },
      },
    });

    console.log(`Created club: ${name} with ${members.length} members and ${posts.length} posts`);
  }

  // Create 2 sample events
  const eventsData: Array<{
    id: string;
    title: string;
    description: string;
    date: Date;
    location: string;
    city: string;
    category: string;
    price: number;
    maxAttendees: number;
    rsvps: Array<{ userId: string; status: RsvpStatus }>;
  }> = [
    {
      id: 'event_001',
      title: 'Sunset Beach Yoga',
      description: 'Join us for a relaxing yoga session on the beach as the sun sets. All levels welcome. Bring your own mat and water.',
      date: new Date('2025-08-15T18:00:00.000Z'),
      location: 'South Beach, Miami',
      city: 'Miami',
      category: 'wellness',
      price: 15.0,
      maxAttendees: 30,
      rsvps: [
        { userId: 'user_001', status: RsvpStatus.GOING },
        { userId: 'user_004', status: RsvpStatus.GOING },
        { userId: 'user_006', status: RsvpStatus.INTERESTED },
      ],
    },
    {
      id: 'event_002',
      title: 'Live Music & Networking Night',
      description: 'An evening of live music performances and networking for creatives. Meet fellow artists, musicians, and art enthusiasts.',
      date: new Date('2025-08-20T19:30:00.000Z'),
      location: 'The Roxy, Los Angeles',
      city: 'Los Angeles',
      category: 'social',
      price: 25.0,
      maxAttendees: 100,
      rsvps: [
        { userId: 'user_002', status: RsvpStatus.GOING },
        { userId: 'user_008', status: RsvpStatus.GOING },
        { userId: 'user_010', status: RsvpStatus.GOING },
        { userId: 'user_005', status: RsvpStatus.INTERESTED },
      ],
    },
  ];

  for (const eventData of eventsData) {
    const { id, title, description, date, location, city, category, price, maxAttendees, rsvps } = eventData;

    await prisma.event.create({
      data: {
        id,
        title,
        description,
        date,
        location,
        city,
        category,
        price,
        maxAttendees,
        rsvps: {
          create: rsvps,
        },
      },
    });

    console.log(`Created event: ${title} with ${rsvps.length} RSVPs`);
  }

  // Create sample reports
  const reportsData: Array<{
    reporterId: string;
    targetId: string;
    reason: string;
    description: string;
    status: ReportStatus;
  }> = [
    {
      reporterId: 'user_001',
      targetId: 'user_003',
      reason: 'inappropriate_behavior',
      description: 'User sent offensive messages in chat',
      status: ReportStatus.PENDING,
    },
    {
      reporterId: 'user_004',
      targetId: 'user_009',
      reason: 'fake_profile',
      description: 'Profile pictures appear to be stolen from the internet',
      status: ReportStatus.PENDING,
    },
    {
      reporterId: 'user_007',
      targetId: 'user_010',
      reason: 'spam',
      description: 'Sending promotional links in messages',
      status: ReportStatus.RESOLVED,
    },
  ];

  for (const report of reportsData) {
    await prisma.report.create({
      data: report,
    });
  }
  console.log(`Created ${reportsData.length} reports`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e: Error): never => {
    console.error(e);
    process.exit(1);
  })
  .finally(async (): Promise<void> => {
    await prisma.$disconnect();
  });
