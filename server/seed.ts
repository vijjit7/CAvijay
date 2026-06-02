import { db } from "./db";
import { users } from "@shared/schema";

const USERS = [
  {
    id: 'ADMIN',
    username: 'admin',
    password: 'password@123',
    name: 'Admin',
    role: 'System Administrator',
    avatar: ''
  },
  {
    id: 'A1',
    username: 'bharat',
    password: 'password123',
    name: 'Bharat',
    role: 'Verification Officer',
    avatar: ''
  },
  {
    id: 'A2',
    username: 'narender',
    password: 'password123',
    name: 'Narender',
    role: 'Verification Officer',
    avatar: ''
  },
  {
    id: 'A3',
    username: 'upender',
    password: 'password123',
    name: 'Upender',
    role: 'Verification Officer',
    avatar: ''
  },
  {
    id: 'A4',
    username: 'avinash',
    password: 'password123',
    name: 'Avinash',
    role: 'Verification Officer',
    avatar: ''
  },
  {
    id: 'A5',
    username: 'prashanth',
    password: 'password123',
    name: 'Prashanth',
    role: 'Verification Officer',
    avatar: ''
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
