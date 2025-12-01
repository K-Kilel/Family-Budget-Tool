import { getDb } from "./db";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS accounts(
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     type TEXT NOT NULL,
     balance REAL NOT NULL DEFAULT 0,
     currency TEXT NOT NULL
   );`
];

export async function runMigrations() {
  const db = await getDb();
  for (const sql of MIGRATIONS) {
    await db.execute(sql);
  }
}
