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

// Create the application tables if they are missing. The project manages its
// schema with `drizzle-kit push` (no migration files), so when new tables are
// added to shared/schema.ts they only reach production if someone re-runs the
// push. This idempotent guard creates the newer tables on startup so a deploy
// can never end up with the schema out of sync (mirrors the session table's
// createTableIfMissing). CREATE TABLE IF NOT EXISTS is a no-op when the table
// already exists, so it is safe to run on every boot.
export async function ensureSchema(): Promise<void> {
  if (!pool) return;
  const ddl = `
    CREATE TABLE IF NOT EXISTS expenses (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      user_id varchar(10) NOT NULL REFERENCES users(id),
      date text NOT NULL,
      category text NOT NULL,
      description text NOT NULL DEFAULT '',
      amount numeric(12,2) NOT NULL,
      approver_id varchar(10) NOT NULL REFERENCES users(id),
      bill_file_url text,
      status text NOT NULL DEFAULT 'pending',
      approved_at timestamp,
      paid_at timestamp,
      rejection_reason text,
      is_own_cost boolean NOT NULL DEFAULT false,
      payments jsonb NOT NULL DEFAULT '[]',
      created_at timestamp NOT NULL DEFAULT now()
    );
    -- Backfill the part-payments column on expenses tables created before it existed.
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payments jsonb NOT NULL DEFAULT '[]';
    CREATE TABLE IF NOT EXISTS bank_statements (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      bank_name text NOT NULL,
      account_number text,
      month text NOT NULL,
      opening_balance numeric(14,2) NOT NULL,
      closing_balance numeric(14,2) NOT NULL,
      source_file_url text,
      uploaded_by varchar(10) NOT NULL REFERENCES users(id),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      statement_id integer NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
      date text NOT NULL,
      narration text NOT NULL DEFAULT '',
      debit numeric(14,2),
      credit numeric(14,2),
      balance numeric(14,2),
      category text NOT NULL DEFAULT 'Unclassified',
      comment text NOT NULL DEFAULT '',
      row_index integer NOT NULL DEFAULT 0
    );
  `;
  await pool.query(ddl);
  console.log('[SERVER] ensureSchema: expenses / bank_statements / bank_transactions verified');
}
