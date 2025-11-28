import fs from "node:fs";
import path from "node:path";

// Lazy require better-sqlite3 to avoid breaking dev before install
let Database: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Database = require("better-sqlite3");
} catch (e) {
  throw new Error(
    "Missing dependency 'better-sqlite3'. Run: npm install better-sqlite3."
  );
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "budget.db");

export function getDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  migrate(db);
  return db;
}

function migrate(db: any) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      trx_date TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      currency TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category_id TEXT
    );

    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      trx_date TEXT NOT NULL,
      from_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      target_date TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS project_contributions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      inv_date TEXT NOT NULL,
      instrument TEXT NOT NULL,
      amount REAL NOT NULL,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      notes TEXT
    );
  `);
}

export type Row = Record<string, unknown>;

export function listAll(db: any) {
  const q = (sql: string) => db.prepare(sql).all();
  return {
    accounts: q("select * from accounts order by created_at asc"),
    transactions: q("select * from transactions order by trx_date desc, id desc"),
    transfers: q("select * from transfers order by trx_date desc, id desc"),
    projects: q("select * from projects order by target_date asc, name asc"),
    project_contributions: q("select * from project_contributions order by date desc, id desc"),
    investments: q("select * from investments order by inv_date desc, id desc"),
  } as const;
}

