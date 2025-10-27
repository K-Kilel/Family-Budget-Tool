import Database from "@tauri-apps/plugin-sql";
import { appDataDir, join } from "@tauri-apps/api/path";

let dbPromise: Promise<any> | null = null;

export async function getDb() {
  if (!dbPromise) {
    const dir = await appDataDir();
    const dbPath = await join(dir, "budgeting", "budget.db");
    dbPromise = Database.load(`sqlite:${dbPath}`);
  }
  return dbPromise!;
}
