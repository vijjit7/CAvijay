import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Check if DATABASE_URL is available (don't crash if not, allow health checks)
const hasDatabaseUrl = !!process.env.DATABASE_URL;

if (!hasDatabaseUrl) {
  console.warn(
    "⚠️ DATABASE_URL is not set. Database features will not be available.",
  );
}

// Determine SSL settings - Replit's DATABASE_URL usually handles SSL internally
const sslConfig = process.env.DATABASE_URL?.includes('sslmode=') 
  ? undefined  // Let connection string handle SSL
  : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false);

// Only create pool if DATABASE_URL is available
export const pool = hasDatabaseUrl ? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection not established
  ssl: sslConfig,
}) : null;

// Handle pool errors to prevent crashes
if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
}

// Create db instance only if pool is available
export const db = pool ? drizzle(pool, { schema }) : null;

// Helper function to ensure db is available before use
export function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL must be set. Database is not available.");
  }
  return db;
}
