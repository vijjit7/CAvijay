import { db } from "./db";
import { users } from "@shared/schema";

const USERS = [
  {
    id: 'ADMIN',
    username: 'admin',
    password: 'password123',
    name: 'Admin',
    role: 'System Administrator',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80'
  },
  {
    id: 'A1',
    username: 'bharat',
    password: 'password123',
    name: 'Bharat',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80'
  },
  {
    id: 'A2',
    username: 'narender',
    password: 'password123',
    name: 'Narender',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80'
  },
  {
    id: 'A3',
    username: 'upender',
    password: 'password123',
    name: 'Upender',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&q=80'
  },
  {
    id: 'A4',
    username: 'avinash',
    password: 'password123',
    name: 'Avinash',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=150&q=80'
  },
  {
    id: 'A5',
    username: 'prashanth',
    password: 'password123',
    name: 'Prashanth',
    role: 'Verification Officer',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&q=80'
  }
];

async function seed() {
  console.log('Seeding database...');
  
  try {
    // Insert all users including admin
    await db.insert(users).values(USERS).onConflictDoNothing();
    console.log('✓ Seeded 6 users (1 admin + 5 associates)');
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
  
  console.log('Database seeding complete!');
  process.exit(0);
}

export { USERS, seed };

seed();
