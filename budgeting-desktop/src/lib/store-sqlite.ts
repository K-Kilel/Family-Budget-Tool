import { v4 as uuid } from "uuid";
import { getDb } from "./db";

/* ==========================================================
   Types
========================================================== */
export type Currency = "USD" | "KSH";

export type Account = {
  id: string;
  name: string;
  type: "Savings" | "Investment" | "Wallet" | "Bank";
  balance: number;
  currency: Currency;
};

export type Income = {
  id: string;
  date: string;
  source: string;
  amount: number;
  accountId: string;
  notes?: string;
};

export type Expense = {
  id: string;
  date: string;
  category: string;
  amount: number;
  isRecurring: boolean;
  accountId: string;
  notes?: string;
};

export type Transfer = {
  id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  notes?: string;
};

/* ==========================================================
   Core helpers
========================================================== */
async function exec(sql: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  await db.execute(sql, params);
}

async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const rows = await db.select(sql, params); // no <T> generics
  return rows as T[];
}

/* ==========================================================
   Accounts
========================================================== */
export async function listAccounts(): Promise<Account[]> {
  return query<Account>(
    "SELECT id, name, type, balance, currency FROM accounts ORDER BY name ASC"
  );
}

export async function addAccount(a: Omit<Account, "id">): Promise<Account> {
  const id = uuid();
  await exec(
    "INSERT INTO accounts (id, name, type, balance, currency) VALUES (?, ?, ?, ?, ?)",
    [id, a.name, a.type, a.balance ?? 0, a.currency]
  );
  return { id, ...a };
}

export async function deleteAccount(id: string): Promise<void> {
  await exec("DELETE FROM accounts WHERE id = ?", [id]);
}

/* ==========================================================
   Income
========================================================== */
export async function listIncomes(): Promise<Income[]> {
  return query<Income>(
    "SELECT id, date, source, amount, accountId, notes FROM incomes ORDER BY date DESC"
  );
}

export async function addIncome(i: Omit<Income, "id">): Promise<Income> {
  const id = uuid();
  await exec(
    "INSERT INTO incomes (id, date, source, amount, accountId, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [id, i.date, i.source, i.amount, i.accountId, i.notes || null]
  );
  return { id, ...i };
}

export async function deleteIncome(id: string): Promise<void> {
  await exec("DELETE FROM incomes WHERE id = ?", [id]);
}

/* ==========================================================
   Expenses
========================================================== */
export async function listExpenses(): Promise<Expense[]> {
  return query<Expense>(
    "SELECT id, date, category, amount, isRecurring, accountId, notes FROM expenses ORDER BY date DESC"
  );
}

export async function addExpense(e: Omit<Expense, "id">): Promise<Expense> {
  const id = uuid();
  await exec(
    "INSERT INTO expenses (id, date, category, amount, isRecurring, accountId, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, e.date, e.category, e.amount, e.isRecurring ? 1 : 0, e.accountId, e.notes || null]
  );
  return { id, ...e };
}

export async function deleteExpense(id: string): Promise<void> {
  await exec("DELETE FROM expenses WHERE id = ?", [id]);
}

/* ==========================================================
   Transfers
========================================================== */
export async function listTransfers(): Promise<Transfer[]> {
  return query<Transfer>(
    "SELECT id, date, fromAccountId, toAccountId, amount, notes FROM transfers ORDER BY date DESC"
  );
}

export async function addTransfer(t: Omit<Transfer, "id">): Promise<Transfer> {
  const id = uuid();
  await exec(
    "INSERT INTO transfers (id, date, fromAccountId, toAccountId, amount, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [id, t.date, t.fromAccountId, t.toAccountId, t.amount, t.notes || null]
  );
  return { id, ...t };
}

export async function deleteTransfer(id: string): Promise<void> {
  await exec("DELETE FROM transfers WHERE id = ?", [id]);
}

/* ==========================================================
   Initialize tables
========================================================== */
export async function initTables() {
  const db = await getDb();
  const tables = [
    `CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS incomes (
      id TEXT PRIMARY KEY,
      date TEXT,
      source TEXT,
      amount REAL,
      accountId TEXT,
      notes TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT,
      category TEXT,
      amount REAL,
      isRecurring INTEGER,
      accountId TEXT,
      notes TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      date TEXT,
      fromAccountId TEXT,
      toAccountId TEXT,
      amount REAL,
      notes TEXT
    );`
  ];

  for (const t of tables) { await db.execute(t);}
}
