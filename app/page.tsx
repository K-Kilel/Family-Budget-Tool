"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Trash2,
  Plus,
  Download,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Check,
  ArrowLeftRight,
} from "lucide-react";
import { 
  ResponsiveContainer, 
  LineChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  Line 
} from 'recharts';

// Supabase helpers (Step 3A)
import {
  signIn, signUp, getUser, signOut,
  ensureWorkspace,
  listAccountsSupabase, addAccountSupabase,
  addTransactionSupabase, listTransactionsSupabase, deleteTransactionSupabase, updateTransactionSupabase,
  addTransferSupabase, listTransfersSupabase, updateTransferSupabase, deleteTransferSupabase,
  addProjectSupabase, listProjectsSupabase, deleteProjectSupabase,
  addProjectContributionSupabase, listProjectContributionsSupabase, deleteProjectContributionSupabase,
  addInvestmentSupabase, listInvestmentsSupabase, deleteInvestmentSupabase,
} from "@/lib/supa-helpers";
import type { NewTransaction, NewAccount, NewTransfer, NewProject, NewProjectContribution } from "@/lib/supa-helpers";

/* ===========================
   Types
=========================== */
type Currency = "USD" | "KSH";
type Id = string;

type Income = {
  id: Id;
  date: string;
  source: string;
  amount: number;
  accountId: Id;
  notes?: string;
};

type RecurrencePeriod = "monthly" | "quarterly" | "annually"; // (extendable later)
type Recurrence = {
  enabled: boolean;
  period: RecurrencePeriod;
  start: string;       // ISO date
  end?: string;        // ISO date
};

type Expense = {
  id: Id;
  date: string;
  category: string;
  amount: number;
  isRecurring: boolean;         // legacy toggle (still surfaced)
  recurrence?: Recurrence;      // NEW: structured recurrence
  accountId: Id;
  notes?: string;
};

type Account = {
  id: Id;
  name: string;
  type: "Savings" | "Investment" | "Wallet" | "Bank";
  balance: number;
  currency: Currency;
};

type Transfer = {
  id: Id;
  date: string;
  fromAccountId: Id;
  toAccountId: Id;
  amount: number;
  notes?: string;
};

// Account transactions are derived from incomes/expenses/transfers
type AccountTxn = {
  id: Id;
  date: string;
  accountId: Id;
  type: "Deposit" | "Withdrawal"; // per-side for transfers too
  amount: number;
  linkedType: "Income" | "Expense" | "Transfer";
  linkedId: Id;
  notes?: string;
  transferFromId?: Id; // only for Transfer
  transferToId?: Id;   // only for Transfer
};

type Project = { id: Id; name: string; targetAmount: number; targetDate: string; notes?: string };
type ProjectContribution = { id: Id; projectId: Id; date: string; amount: number };

type Investment = {
  id: Id;
  date: string;               // ISO date
  instrument: string;         // e.g., "MMF", "ETF", "Bonds"
  amount: number;             // +contribution, -withdrawal
  accountId?: Id;             // optional: which account funded/received
  notes?: string;
};

type Store = {
  currency: Currency;
  incomes: Income[];
  expenses: Expense[];
  accounts: Account[];
  transfers: Transfer[];
  accountTxns: AccountTxn[]; // auto-maintained
  projects: Project[];
  projectContribs: ProjectContribution[];
  investments: Investment[]; // NEW
};

const LS_KEY = "budgeting-tool-mvp-v2";

/* ===========================
   Utils
=========================== */
const mkId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
};

const emptyStore: Store = {
  currency: "USD",
  incomes: [],
  expenses: [],
  accounts: [{ id: mkId(), name: "Cash", type: "Wallet", balance: 0, currency: "USD" as Currency }],
  transfers: [],
  accountTxns: [],
  projects: [],
  projectContribs: [],
  investments: [],
};

const fmt = (n: number, c: Currency) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n || 0);
const ymKey = (d: string) => d?.slice(0, 7) ?? ""; // YYYY-MM
const yearFrom = (d: string) => d?.slice(0, 4) ?? "";
const monthFrom = (d: string) => d?.slice(5, 7) ?? "";
const todayISO = () => new Date().toISOString().slice(0, 10);
const parseNum = (v: string) => (Number.isFinite(+v) ? +v : 0);

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const monthNameFromYM = (ym: string) => {
  const m = Number(monthFrom(ym));
  if (!m) return ym;
  return MONTH_LABELS[m - 1];
};
const monthIndexFromName = (name: string) =>
  MONTH_LABELS.findIndex((m) => m.toLowerCase() === name.toLowerCase()); // 0-based

// Aggregate by month helper
const monthlyTotals = (rows: { date: string; amount: number }[]) => {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const k = ymKey(r.date);
    if (!k) return;
    map.set(k, (map.get(k) || 0) + r.amount);
  });
  const keys = Array.from(map.keys()).sort();
  return keys.map((k) => ({ month: k, total: +(map.get(k) || 0).toFixed(2) }));
};

// Month switcher helpers
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function fmtMonth(d: Date) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function firstOfMonthFromYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}
function monthsDiff(a: string, b: string) {
  // a,b are YYYY-MM
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
function inRangeMonth(ym: string, startISO: string, endISO?: string) {
  const sYM = ymKey(startISO);
  const eYM = endISO ? ymKey(endISO) : undefined;
  if (!sYM) return false;
  if (eYM && ym > eYM) return false;
  return ym >= sYM;
}
function recurrenceOccursThisMonth(exp: Expense, ym: string): boolean {
  const r = exp.recurrence;
  const enabled = r?.enabled || exp.isRecurring;
  if (!enabled) return false;

  const anchorISO = r?.start || exp.date;
  if (!inRangeMonth(ym, anchorISO, r?.end)) return false;

  const diff = monthsDiff(ymKey(anchorISO), ym);
  const period = r?.period || "monthly";
  if (diff < 0) return false;

  switch (period) {
    case "monthly":
      return true;
    case "quarterly":
      return diff % 3 === 0;
    case "annually":
      return diff % 12 === 0;
    default:
      return false;
  }
}

/* UI: Month switcher */
function MonthSwitcher({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={() => onChange(addMonths(value, -1))} aria-label="Previous month">
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <div className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5">
        <span className="font-medium">{fmtMonth(value)}</span>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onChange(addMonths(value, 1))} aria-label="Next month">
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

/* ===========================
   Page
=========================== */
export default function Page() {
  const [store, setStore] = useState<Store>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
      if (!raw) return emptyStore;
      const parsed = JSON.parse(raw) as Store;
      return { ...emptyStore, ...parsed };
    } catch {
      return emptyStore;
    }
  });

  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const month = monthKeyFromDate(selectedMonth); // YYYY-MM

  // Chart filters (Year + Month dropdowns)
  const currentYear = String(new Date().getFullYear());
  const allYearsInData = useMemo(() => {
    const ys = new Set<string>();
    store.incomes.forEach((i) => { const y = yearFrom(i.date); if (y) ys.add(y); });
    store.expenses.forEach((e) => { const y = yearFrom(e.date); if (y) ys.add(y); });
    store.investments.forEach((v) => { const y = yearFrom(v.date); if (y) ys.add(y); });
    return Array.from(ys).sort();
  }, [store.incomes, store.expenses, store.investments]);

  const [chartYear, setChartYear] = useState<string>(
    allYearsInData.includes(currentYear) ? currentYear : allYearsInData[0] || currentYear
  );
  const [chartMonth, setChartMonth] = useState<string>("All");

  useEffect(() => {
    if (allYearsInData.length && !allYearsInData.includes(chartYear)) {
      setChartYear(allYearsInData[allYearsInData.length - 1]);
    }
  }, [allYearsInData, chartYear]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, JSON.stringify(store));
    }
  }, [store]);

  // Cloud (Supabase) state
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [cloudOn, setCloudOn] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState<boolean>(false);
  const [deriveBalances, setDeriveBalances] = useState<boolean>(true);

  // Hydrate core data from Supabase
  const hydrateFromSupabase = async (wsId: string) => {
    try {
      setCloudLoading(true);
      const [acctRows, txRows, trRows, invRows, projRows, contribRows] = await Promise.all([
        listAccountsSupabase(wsId),
        listTransactionsSupabase(wsId, 1000),
        listTransfersSupabase(wsId),
        listInvestmentsSupabase(wsId),
        listProjectsSupabase(wsId),
        listProjectContributionsSupabase(wsId),
      ]);

      type SBAccountRow = { id: string; name: string; type: Account["type"]; currency: string; balance: number | null };
      const accountsCloud: Account[] = (acctRows as SBAccountRow[]).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: (a.currency === "KSH" ? "KSH" : "USD") as Currency,
        balance: Number(a.balance ?? 0),
      }));

      type SBTrxRow = { id: string; trx_date: string; amount: number; description?: string | null; account_id: string };
      const incomesCloud: Income[] = (txRows as SBTrxRow[])
        .filter((t) => Number(t.amount) > 0)
        .map((t) => ({
          id: t.id,
          date: t.trx_date,
          source: t.description ?? "",
          amount: Number(t.amount),
          accountId: t.account_id,
          notes: undefined,
        }));

      const expensesCloud: Expense[] = (txRows as SBTrxRow[])
        .filter((t) => Number(t.amount) < 0)
        .map((t) => ({
          id: t.id,
          date: t.trx_date,
          category: t.description ?? "Expense",
          amount: Math.abs(Number(t.amount)),
          isRecurring: false,
          accountId: t.account_id,
          notes: undefined,
        }));

      // Derive account transactions from incomes/expenses
      const transfersCloud: Transfer[] = (trRows as { id: string; trx_date: string; from_account_id: string; to_account_id: string; amount: number; notes?: string | null }[]).map((t) => ({
        id: t.id,
        date: t.trx_date,
        fromAccountId: t.from_account_id,
        toAccountId: t.to_account_id,
        amount: Number(t.amount),
        notes: t.notes ?? undefined,
      }));

      const investmentsCloud: Investment[] = (invRows as { id: string; inv_date: string; instrument: string; amount: number; account_id?: string | null; notes?: string | null }[]).map((v) => ({
        id: v.id,
        date: v.inv_date,
        instrument: v.instrument,
        amount: Number(v.amount),
        accountId: v.account_id ?? undefined,
        notes: v.notes ?? undefined,
      }));

      const projectsCloud: Project[] = (projRows as { id: string; name: string; target_amount: number; target_date: string; notes?: string | null }[]).map((p) => ({
        id: p.id,
        name: p.name,
        targetAmount: Number(p.target_amount),
        targetDate: p.target_date,
        notes: p.notes ?? undefined,
      }));

      const projectContribsCloud: ProjectContribution[] = (contribRows as { id: string; project_id: string; date: string; amount: number }[]).map((c) => ({
        id: c.id,
        projectId: c.project_id,
        date: c.date,
        amount: Number(c.amount),
      }));

      // Build new store based on cloud + previous local data
      setStore((prev) => {
        const mergeById = <T extends { id: string }>(cloud: T[], local: T[]) => {
          const ids = new Set(cloud.map((x) => x.id));
          return [...cloud, ...local.filter((x) => !ids.has(x.id))];
        };

        const accounts = mergeById(accountsCloud, prev.accounts);
        const incomes = mergeById(incomesCloud, prev.incomes);
        const expenses = mergeById(expensesCloud, prev.expenses);
        const transfers = mergeById(transfersCloud, prev.transfers);
        const investments = mergeById(investmentsCloud, prev.investments);
        const projects = mergeById(projectsCloud, prev.projects);
        const projectContribs = mergeById(projectContribsCloud, prev.projectContribs);

        const accountTxns: AccountTxn[] = [
          ...incomes.map((i) => ({
            id: mkId(),
            date: i.date,
            accountId: i.accountId,
            type: "Deposit" as const,
            amount: i.amount,
            linkedType: "Income" as const,
            linkedId: i.id,
            notes: i.source || "Income",
          })),
          ...expenses.map((e) => ({
            id: mkId(),
            date: e.date,
            accountId: e.accountId,
            type: "Withdrawal" as const,
            amount: e.amount,
            linkedType: "Expense" as const,
            linkedId: e.id,
            notes: e.category || "Expense",
          })),
          ...transfers.flatMap((t) => [
            {
              id: mkId(),
              date: t.date,
              accountId: t.fromAccountId,
              type: "Withdrawal" as const,
              amount: t.amount,
              linkedType: "Transfer" as const,
              linkedId: t.id,
              notes: t.notes || "Transfer",
              transferFromId: t.fromAccountId,
              transferToId: t.toAccountId,
            },
            {
              id: mkId(),
              date: t.date,
              accountId: t.toAccountId,
              type: "Deposit" as const,
              amount: t.amount,
              linkedType: "Transfer" as const,
              linkedId: t.id,
              notes: t.notes || "Transfer",
              transferFromId: t.fromAccountId,
              transferToId: t.toAccountId,
            },
          ]),
          ...investments
            .filter((v) => !!v.accountId)
            .map((v) => ({
              id: mkId(),
              date: v.date,
              accountId: v.accountId!,
              type: v.amount > 0 ? ("Withdrawal" as const) : ("Deposit" as const),
              amount: Math.abs(v.amount),
              linkedType: "Expense" as const,
              linkedId: v.id,
              notes: v.instrument || "Investment",
            })),
        ].sort((a, b) => b.date.localeCompare(a.date));

        // Optionally derive balances from activity
        let accountsForStore = accounts;
        if (deriveBalances) {
          const map = new Map<string, number>();
          accounts.forEach((a) => map.set(a.id, 0));
          incomes.forEach((i) => map.set(i.accountId, (map.get(i.accountId) || 0) + i.amount));
          expenses.forEach((e) => map.set(e.accountId, (map.get(e.accountId) || 0) - e.amount));
          transfers.forEach((t) => {
            map.set(t.fromAccountId, (map.get(t.fromAccountId) || 0) - t.amount);
            map.set(t.toAccountId, (map.get(t.toAccountId) || 0) + t.amount);
          });
          investments.forEach((v) => {
            if (!v.accountId) return;
            const delta = v.amount > 0 ? -Math.abs(v.amount) : Math.abs(v.amount);
            map.set(v.accountId, (map.get(v.accountId) || 0) + delta);
          });
          accountsForStore = accounts.map((a) => ({ ...a, balance: +(map.get(a.id) || 0).toFixed(2) }));
        }

        return {
          ...prev,
          accounts: accountsForStore,
          incomes,
          expenses,
          transfers,
          investments,
          projects,
          projectContribs,
          accountTxns,
        };
      });
    } finally {
      setCloudLoading(false);
    }
  };

  // Ensure we use a Supabase account id for transactions when Cloud is On
  async function ensureCloudAccountId(wsId: string, localAccountId: Id): Promise<string> {
    const local = store.accounts.find((a) => a.id === localAccountId);
    if (!local) throw new Error("Selected account not found");
    const accts = await listAccountsSupabase(wsId) as { id: string; name: string; type: Account["type"]; currency: string }[];
    // If the local id already matches a cloud id, use it
    if (accts.some((a) => a.id === localAccountId)) return localAccountId;
    // Try match by name+type+currency
    const match = accts.find((a) => a.name === local.name && a.type === local.type && a.currency === local.currency);
    if (match) return match.id;
    // Create and fetch again
    await addAccountSupabase(wsId, { name: local.name, type: local.type, currency: local.currency, balance: local.balance } as NewAccount);
    const accts2 = await listAccountsSupabase(wsId) as { id: string; name: string; type: Account["type"]; currency: string }[];
    const created = accts2.find((a) => a.name === local.name && a.type === local.type && a.currency === local.currency);
    if (!created) throw new Error("Failed to resolve cloud account");
    return created.id;
  }

  // (Removed import/migration helpers to revert to pre-import behavior)

  // Bootstrap Supabase session and workspace
  useEffect(() => {
    (async () => {
      try {
        const u = await getUser();
        if (!u) {
          setCloudOn(false);
          setWorkspaceId(null);
          setUserEmail(null);
          return;
        }
        setUserEmail(u.email ?? null);
        const wsId = await ensureWorkspace("My Budget");
        setWorkspaceId(wsId);
        setCloudOn(true);
        await hydrateFromSupabase(wsId);
      } catch (e) {
        // If anything fails, stay in local mode
        console.warn("Supabase bootstrap failed:", e);
        setCloudOn(false);
        setWorkspaceId(null);
      }
    })();
  }, []);

  // Derived values
  const currency = store.currency;

  const incomeThisMonth = useMemo(
    () => store.incomes.filter((i) => ymKey(i.date) === month).reduce((s, i) => s + i.amount, 0),
    [store, month]
  );

  // For the Expenses tab: real + projected recurring for visualisation
  const monthExpensesReal = useMemo(
    () => store.expenses.filter((e) => ymKey(e.date) === month),
    [store.expenses, month]
  );

  const monthExpensesProjectedOnly = useMemo(() => {
    // Build synthetic rows for recurring expenses that should appear this month but don't have an entry this month
    const projected: Expense[] = [];
    const seenReal = new Set(store.expenses.filter(e => ymKey(e.date) === month).map(e => e.id));

    store.expenses.forEach((e) => {
      if (!recurrenceOccursThisMonth(e, month)) return;
      // If the original expense itself is dated this month, it's already in real set.
      // Otherwise add a projected row with a synthetic id.
      if (ymKey(e.date) !== month) {
        projected.push({
          ...e,
          id: `${e.id}__proj__${month}`,
          date: new Date(
            firstOfMonthFromYM(month).getFullYear(),
            firstOfMonthFromYM(month).getMonth(),
            Math.min(28, new Date(e.date).getDate() || 1)
          )
            .toISOString()
            .slice(0, 10),
          notes: (e.notes ? `${e.notes} • ` : "") + "(Projected)",
        });
      }
    });

    // Avoid any accidental duplicates by category/amount/account when a manual entry already exists this month
    const realSig = new Set(
      monthExpensesReal.map((r) => `${r.category}|${r.amount}|${r.accountId}`)
    );
    return projected.filter((p) => !realSig.has(`${p.category}|${p.amount}|${p.accountId}`));
  }, [store.expenses, month, monthExpensesReal]);

  const monthExpensesForDisplay = useMemo(
    () => [...monthExpensesReal, ...monthExpensesProjectedOnly].sort((a, b) => a.date.localeCompare(b.date)),
    [monthExpensesReal, monthExpensesProjectedOnly]
  );

  // Totals for cards (we keep REALs for accounting numbers)
  const expenseThisMonth = useMemo(
    () => monthExpensesReal.reduce((s, e) => s + e.amount, 0),
    [monthExpensesReal]
  );

  const projectedRecurringMonthly = useMemo(() => {
    // Sum of one period's worth of recurring expenses (just use source rows)
    return store.expenses
      .filter((e) => e.isRecurring || e.recurrence?.enabled)
      .reduce((s, e) => s + e.amount, 0);
  }, [store.expenses]);

  const netThisMonth = +(incomeThisMonth - expenseThisMonth).toFixed(2);
  const totalAccountBalances = store.accounts.reduce((s, a) => s + a.balance, 0);

  // Month-filtered tables
  const monthIncomes = useMemo(
    () => store.incomes.filter((i) => ymKey(i.date) === month),
    [store.incomes, month]
  );
  const monthAccountTxns = useMemo(
    () => store.accountTxns.filter((t) => ymKey(t.date) === month),
    [store.accountTxns, month]
  );

  // Goals math
  const projectStats = store.projects.map((p) => {
    const contributed = store.projectContribs.filter((c) => c.projectId === p.id).reduce((s, c) => s + c.amount, 0);
    const remaining = Math.max(0, p.targetAmount - contributed);
    const monthsLeft = Math.max(
      1,
      Math.ceil((new Date(p.targetDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30.4))
    );
    const requiredMonthly = +(remaining / monthsLeft).toFixed(2);
    return { project: p, contributed, remaining, monthsLeft, requiredMonthly };
  });
  const requiredForGoalsMonthly = projectStats.reduce((s, x) => s + x.requiredMonthly, 0);
  const availableForGoalsThisMonth = +(netThisMonth - requiredForGoalsMonthly).toFixed(2);

  // Trend data (+ Investments line)
  const incomeByMonth = monthlyTotals(store.incomes);
  const expenseByMonth = monthlyTotals(store.expenses);
  const investmentByMonth = monthlyTotals(store.investments);

  const mergedTrendRaw = Array.from(
    new Set([
      ...incomeByMonth.map((d) => d.month),
      ...expenseByMonth.map((d) => d.month),
      ...investmentByMonth.map((d) => d.month),
    ])
  )
    .sort()
    .map((m) => ({
      month: m,
      income: incomeByMonth.find((x) => x.month === m)?.total || 0,
      expenses: expenseByMonth.find((x) => x.month === m)?.total || 0,
      investments: investmentByMonth.find((x) => x.month === m)?.total || 0,
      net:
        (incomeByMonth.find((x) => x.month === m)?.total || 0) -
        (expenseByMonth.find((x) => x.month === m)?.total || 0),
    }));

  const mergedTrend = useMemo(() => {
    const filtered = mergedTrendRaw.filter((row) => yearFrom(row.month) === chartYear);
    const monthFiltered =
      chartMonth === "All"
        ? filtered
        : filtered.filter((row) => {
            const idx = monthIndexFromName(chartMonth);
            return Number(monthFrom(row.month)) === idx + 1;
          });
    return monthFiltered.map((r) => ({ ...r, xLabel: monthNameFromYM(r.month) }));
  }, [mergedTrendRaw, chartYear, chartMonth]);

  /* ---------------------------
     Account adjust helper
  --------------------------- */
  function adjust(accounts: Account[], accountId: Id, delta: number) {
    return accounts.map((a) => (a.id === accountId ? { ...a, balance: +(a.balance + delta).toFixed(2) } : a));
  }

  /* ---------------------------
     Income / Expense CRUD
  --------------------------- */
const addIncome = (inc: Omit<Income, "id">) => {
  if (cloudOn && workspaceId) {
    (async () => {
      try {
        const resolvedAccountId = await ensureCloudAccountId(workspaceId, inc.accountId);

        const payload: NewTransaction = {
          workspace_id: workspaceId,
          account_id: resolvedAccountId,
          trx_date: inc.date,
          amount: +inc.amount,
          description: inc.source,
          currency: store.currency,
          category_id: null,
        };

        // ✅ Add to Supabase (cloud)
        await addTransactionSupabase(payload);

        // ✅ Immediately reflect locally
        setStore((s) => ({
          ...s,
          incomes: [{ ...inc, id: mkId() }, ...s.incomes],
        }));

        // ❌ no more hydrateFromSupabase here
      } catch (e: any) {
        console.error("Add income failed", e);
        alert(`Add income failed: ${e?.message || e}`);
      }
    })();
    return;
  }

  // Local-only mode (offline)
  const id = mkId();
  const income: Income = { ...inc, id };
  setStore((s) => {
    const accounts = adjust(s.accounts, inc.accountId, inc.amount);
    const accountTxns: AccountTxn[] = [
      {
        id: mkId(),
        date: inc.date,
        accountId: inc.accountId,
        type: "Deposit",
        amount: inc.amount,
        linkedType: "Income",
        linkedId: id,
        notes: inc.source || "Income",
      },
      ...s.accountTxns,
    ];
    return { ...s, incomes: [income, ...s.incomes], accounts, accountTxns };
  });
};



  const delIncome = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteTransactionSupabase(workspaceId, id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const income = s.incomes.find((i) => i.id === id);
      if (!income) return s;
      const accounts = adjust(s.accounts, income.accountId, -income.amount);
      const accountTxns = s.accountTxns.filter((t) => !(t.linkedType === "Income" && t.linkedId === id));
      const incomes = s.incomes.filter((i) => i.id !== id);
      return { ...s, accounts, accountTxns, incomes };
    });
  };

  const addExpense = (exp: Omit<Expense, "id">) => {
    if (cloudOn && workspaceId) {
      (async () => {
        try {
          const resolvedAccountId = await ensureCloudAccountId(workspaceId, exp.accountId);
          const payload: NewTransaction = {
            workspace_id: workspaceId,
            account_id: resolvedAccountId,
            trx_date: exp.date,
            amount: -Math.abs(exp.amount),
            description: exp.category,
            currency: store.currency,
            category_id: null,
          };
          await addTransactionSupabase(payload);
          await hydrateFromSupabase(workspaceId);
        } catch (e: any) {
          console.error("Add income failed", e);
          console.error("Error details:", JSON.stringify(e, null, 2));
          alert(`Add income failed: ${e?.message || JSON.stringify(e) || e}`);
        }
      })();
      return;
    }
    const id = mkId();
    const expense: Expense = { ...exp, id };
    setStore((s) => {
      const accounts = adjust(s.accounts, exp.accountId, -exp.amount);
      const accountTxns: AccountTxn[] = [
        {
          id: mkId(),
          date: exp.date,
          accountId: exp.accountId,
          type: "Withdrawal",
          amount: exp.amount,
          linkedType: "Expense",
          linkedId: id,
          notes: exp.category || "Expense",
        },
        ...s.accountTxns,
      ];
      return { ...s, expenses: [expense, ...s.expenses], accounts, accountTxns };
    });
  };

  const delExpense = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteTransactionSupabase(workspaceId, id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const expense = s.expenses.find((e) => e.id === id);
      if (!expense) return s;
      const accounts = adjust(s.accounts, expense.accountId, +expense.amount);
      const accountTxns = s.accountTxns.filter((t) => !(t.linkedType === "Expense" && t.linkedId === id));
      const expenses = s.expenses.filter((e) => e.id !== id);
      return { ...s, accounts, accountTxns, expenses };
    });
  };

  const addAccount = (acc: Omit<Account, "id">) => {
    if (cloudOn && workspaceId) {
      (async () => {
        try {
          const payload: NewAccount = {
            name: acc.name,
            type: acc.type,
            currency: acc.currency,
            balance: acc.balance,
          };
          await addAccountSupabase(workspaceId, payload);
          await hydrateFromSupabase(workspaceId);
        } catch (e: any) {
          console.error("Add account failed", e);
          alert(`Add account failed: ${e?.message || e}`);
        }
      })();
      return;
    }
    setStore((s) => ({ ...s, accounts: [...s.accounts, { ...acc, id: mkId() }] }));
  };
  const delAccount = (id: Id) =>
    setStore((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));

  const addProject = (p: Omit<Project, "id">) => {
    if (cloudOn && workspaceId) {
      (async () => {
        const payload: NewProject = {
          workspace_id: workspaceId,
          name: p.name,
          target_amount: p.targetAmount,
          target_date: p.targetDate,
          notes: p.notes ?? null,
        };
        await addProjectSupabase(payload);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => ({ ...s, projects: [...s.projects, { ...p, id: mkId() }] }));
  };
  const delProject = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteProjectSupabase(workspaceId, id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => ({
      ...s,
      projects: s.projects.filter((p) => p.id !== id),
      projectContribs: s.projectContribs.filter((c) => c.projectId !== id),
    }));
  };

  const addProjectContribution = (pc: Omit<ProjectContribution, "id">) => {
    if (cloudOn && workspaceId) {
      (async () => {
        const payload: NewProjectContribution = {
          workspace_id: workspaceId,
          project_id: pc.projectId,
          date: pc.date,
          amount: pc.amount,
        };
        await addProjectContributionSupabase(payload);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => ({ ...s, projectContribs: [{ ...pc, id: mkId() }, ...s.projectContribs] }));
  };
  const delProjectContribution = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteProjectContributionSupabase(workspaceId, id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => ({ ...s, projectContribs: s.projectContribs.filter((c) => c.id !== id) }));
  };

  /* ---------------------------
     Investments CRUD (affects account if accountId given)
  --------------------------- */
  const addInvestment = (v: Omit<Investment, "id">) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await addInvestmentSupabase({
          workspace_id: workspaceId,
          account_id: v.accountId ?? null,
          inv_date: v.date,
          instrument: v.instrument,
          amount: v.amount,
          notes: v.notes ?? null,
        });
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    const inv: Investment = { ...v, id: mkId() };
    setStore((s) => {
      let accounts = s.accounts;
      if (inv.accountId) {
        const delta = inv.amount > 0 ? -Math.abs(inv.amount) : Math.abs(inv.amount);
        accounts = adjust(accounts, inv.accountId, delta);
      }
      return { ...s, investments: [inv, ...s.investments], accounts };
    });
  };
  const delInvestment = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteInvestmentSupabase(id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const v = s.investments.find((x) => x.id === id);
      if (!v) return s;
      let accounts = s.accounts;
      if (v.accountId) {
        // revert balance effect
        const delta = v.amount > 0 ? +v.amount : -v.amount;
        accounts = adjust(accounts, v.accountId, delta);
      }
      return { ...s, accounts, investments: s.investments.filter((x) => x.id !== id) };
    });
  };

  /* ---------------------------
     Transfers CRUD + Edit
  --------------------------- */
  const addTransfer = (tr: Omit<Transfer, "id">) => {
    if (tr.fromAccountId === tr.toAccountId || tr.amount <= 0) return;
    if (cloudOn && workspaceId) {
      (async () => {
        const fromId = await ensureCloudAccountId(workspaceId, tr.fromAccountId);
        const toId = await ensureCloudAccountId(workspaceId, tr.toAccountId);
        const payload: NewTransfer = {
          workspace_id: workspaceId,
          trx_date: tr.date,
          from_account_id: fromId,
          to_account_id: toId,
          amount: tr.amount,
          notes: tr.notes ?? null,
        };
        await addTransferSupabase(payload);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    const id = mkId();
    const transfer: Transfer = { ...tr, id };
    setStore((s) => {
      let accounts = adjust(s.accounts, tr.fromAccountId, -tr.amount);
      accounts = adjust(accounts, tr.toAccountId, +tr.amount);

      const fromName = s.accounts.find((a) => a.id === tr.fromAccountId)?.name || "From";
      const toName = s.accounts.find((a) => a.id === tr.toAccountId)?.name || "To";

      const accountTxns: AccountTxn[] = [
        {
          id: mkId(),
          date: tr.date,
          accountId: tr.fromAccountId,
          type: "Withdrawal",
          amount: tr.amount,
          linkedType: "Transfer",
          linkedId: id,
          notes: tr.notes || `Transfer to ${toName}`,
          transferFromId: tr.fromAccountId,
          transferToId: tr.toAccountId,
        },
        {
          id: mkId(),
          date: tr.date,
          accountId: tr.toAccountId,
          type: "Deposit",
          amount: tr.amount,
          linkedType: "Transfer",
          linkedId: id,
          notes: tr.notes || `Transfer from ${fromName}`,
          transferFromId: tr.fromAccountId,
          transferToId: tr.toAccountId,
        },
        ...s.accountTxns,
      ];

      return { ...s, transfers: [transfer, ...s.transfers], accounts, accountTxns };
    });
  };

  const delTransfer = (id: Id) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await deleteTransferSupabase(workspaceId, id);
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const tr = s.transfers.find((t) => t.id === id);
      if (!tr) return s;
      let accounts = adjust(s.accounts, tr.fromAccountId, +tr.amount);
      accounts = adjust(accounts, tr.toAccountId, -tr.amount);
      const accountTxns = s.accountTxns.filter((t) => !(t.linkedType === "Transfer" && t.linkedId === id));
      const transfers = s.transfers.filter((t) => t.id !== id);
      return { ...s, accounts, accountTxns, transfers };
    });
  };

  const updateTransfer = (edited: Transfer) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await updateTransferSupabase(workspaceId, edited.id, {
          trx_date: edited.date,
          from_account_id: edited.fromAccountId,
          to_account_id: edited.toAccountId,
          amount: edited.amount,
          notes: edited.notes ?? null,
        });
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const original = s.transfers.find((t) => t.id === edited.id);
      if (!original) return s;

      // revert original effects
      let accounts = s.accounts;
      accounts = adjust(accounts, original.fromAccountId, +original.amount);
      accounts = adjust(accounts, original.toAccountId, -original.amount);

      // apply new effects
      accounts = adjust(accounts, edited.fromAccountId, -edited.amount);
      accounts = adjust(accounts, edited.toAccountId, +edited.amount);

      const transfers = s.transfers.map((t) => (t.id === edited.id ? edited : t));

      const fromName = s.accounts.find((a) => a.id === edited.fromAccountId)?.name || "From";
      const toName = s.accounts.find((a) => a.id === edited.toAccountId)?.name || "To";

      const accountTxns = s.accountTxns.map((t) => {
        if (t.linkedType === "Transfer" && t.linkedId === edited.id) {
          const isFromSide = t.type === "Withdrawal";
          const newAccountId = isFromSide ? edited.fromAccountId : edited.toAccountId;
          const newNotes = edited.notes || (isFromSide ? `Transfer to ${toName}` : `Transfer from ${fromName}`);
          return {
            ...t,
            date: edited.date,
            accountId: newAccountId,
            amount: edited.amount,
            notes: newNotes,
            transferFromId: edited.fromAccountId,
            transferToId: edited.toAccountId,
          };
        }
        return t;
      });

      return { ...s, accounts, transfers, accountTxns };
    });
  };

  /* ---------------------------
     Edit support for Income/Expense
  --------------------------- */
  const [editingIncomeId, setEditingIncomeId] = useState<Id | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<Id | null>(null);
  const [editingTransferId, setEditingTransferId] = useState<Id | null>(null);

  const updateIncome = (edited: Income) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await updateTransactionSupabase(workspaceId, edited.id, {
          trx_date: edited.date,
          account_id: edited.accountId,
          amount: +edited.amount,
          description: edited.source,
          currency: store.currency,
        });
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const original = s.incomes.find((i) => i.id === edited.id);
      if (!original) return s;

      let accounts = s.accounts;
      if (original.accountId !== edited.accountId) {
        accounts = adjust(accounts, original.accountId, -original.amount);
        accounts = adjust(accounts, edited.accountId, +edited.amount);
      } else {
        const delta = edited.amount - original.amount;
        accounts = adjust(accounts, edited.accountId, delta);
      }

      const incomes = s.incomes.map((i) => (i.id === edited.id ? edited : i));
      const accountTxns = s.accountTxns.map((t) =>
        t.linkedType === "Income" && t.linkedId === edited.id
          ? { ...t, date: edited.date, accountId: edited.accountId, amount: edited.amount, notes: edited.source || t.notes }
          : t
      );
      return { ...s, accounts, incomes, accountTxns };
    });
  };

  const updateExpense = (edited: Expense) => {
    if (cloudOn && workspaceId) {
      (async () => {
        await updateTransactionSupabase(workspaceId, edited.id, {
          trx_date: edited.date,
          account_id: edited.accountId,
          amount: -Math.abs(edited.amount),
          description: edited.category,
          currency: store.currency,
        });
        await hydrateFromSupabase(workspaceId);
      })();
      return;
    }
    setStore((s) => {
      const original = s.expenses.find((e) => e.id === edited.id);
      if (!original) return s;

      let accounts = s.accounts;
      if (original.accountId !== edited.accountId) {
        accounts = adjust(accounts, original.accountId, +original.amount);
        accounts = adjust(accounts, edited.accountId, -edited.amount);
      } else {
        const delta = edited.amount - original.amount;
        accounts = adjust(accounts, edited.accountId, -delta);
      }

      const expenses = s.expenses.map((e) => (e.id === edited.id ? edited : e));
      const accountTxns = s.accountTxns.map((t) =>
        t.linkedType === "Expense" && t.linkedId === edited.id
          ? { ...t, date: edited.date, accountId: edited.accountId, amount: edited.amount, notes: edited.category || t.notes }
          : t
      );
      return { ...s, accounts, expenses, accountTxns };
    });
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `budgeting_data_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importJSON = async (file: File) => {
    const text = await file.text();
    const incoming = JSON.parse(text) as Store;
    setStore((prev) => ({ ...prev, ...incoming }));
  };

  const resetAll = () => {
    if (confirm("Reset all data?")) setStore(emptyStore);
  };

  /* ---------------------------
     Auth Gate: require login
  --------------------------- */
  if (!cloudOn) {
    return (
      <div className="min-h-screen w-full p-6 flex items-center justify-center">
        <AuthCard onSignedIn={async ()=>{
          try {
            const wsId = await ensureWorkspace("My Budget");
            setWorkspaceId(wsId);
            const u = await getUser();
            setUserEmail(u?.email ?? null);
            setCloudOn(true);
            await hydrateFromSupabase(wsId);
          } catch(e) {
            console.warn(e);
          }
        }} />
      </div>
    );
  }

  /* ---------------------------
     Render
  --------------------------- */
  return (
    <div className="min-h-screen w-full p-4 md:p-8">
      <div className="noise-overlay">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg,#ffffff 0%,#c084fc 60%,#ff67f9 100%)" }}
            >
              Family & Personal Budgeting — MVP
            </h1>
            <p className="text-sm text-muted-foreground">
              Quickly capture income, expenses (with recurring), goals/projects, savings/investments, and view simple trends.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MonthSwitcher value={selectedMonth} onChange={setSelectedMonth} />
            <Select value={store.currency} onValueChange={(v) => setStore((s) => ({ ...s, currency: v as Currency }))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KSH">KSH</SelectItem>
              </SelectContent>
            </Select>

            <div className="px-2 py-1 rounded-md border text-xs" title={userEmail || undefined} style={{ borderColor: "var(--border)" }}>
              {cloudOn ? (
                <span>Cloud: On{userEmail ? ` • ${userEmail}` : ""}</span>
              ) : (
                <span>Cloud: Off</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Label className="text-xs">Derived balances</Label>
              <Switch checked={deriveBalances} onCheckedChange={(v)=>{ setDeriveBalances(!!v); if (workspaceId) hydrateFromSupabase(workspaceId); }} />
            </div>
            <Button
              variant="outline"
              onClick={() => { if (workspaceId) hydrateFromSupabase(workspaceId); }}
              disabled={!workspaceId || cloudLoading}
              title="Refresh from cloud"
              className="border-border"
            >
              <RefreshCw className={`h-4 w-4 ${cloudLoading ? "animate-spin" : ""}`} />
            </Button>
            {cloudOn && (
              <Button variant="outline" onClick={async ()=>{ await signOut(); setCloudOn(false); setWorkspaceId(null); setUserEmail(null); }} title="Sign out" className="border-border">
                Sign out
              </Button>
            )}

            <Button variant="outline" onClick={exportJSON} title="Export data JSON" className="border-border">
              <Download className="h-4 w-4" />
            </Button>
            <label
              className="cursor-pointer inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-xl"
              style={{ background: "rgba(255,255,255,0.08)", borderColor: "var(--border)" }}
            >
              <Upload className="h-4 w-4" />
              Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJSON(f);
                }}
              />
            </label>
            <Button variant="destructive" onClick={resetAll} title="Reset">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Main */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 md:w-[1000px]">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="income" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Income
            </TabsTrigger>
            <TabsTrigger value="expenses" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Expenses
            </TabsTrigger>
            <TabsTrigger value="accounts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Accounts
            </TabsTrigger>
            <TabsTrigger value="projects" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Projects/Goals
            </TabsTrigger>
            <TabsTrigger value="investments" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Investments
            </TabsTrigger>
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="mt-6">
            <div className="grid md:grid-cols-4 gap-4">
              <StatCard title={`Income (${fmtMonth(selectedMonth)})`} value={fmt(incomeThisMonth, currency)} />
              <StatCard title={`Expenses (${fmtMonth(selectedMonth)})`} value={fmt(expenseThisMonth, currency)} />
              <StatCard title={`Net (${fmtMonth(selectedMonth)})`} value={fmt(netThisMonth, currency)} highlight={netThisMonth >= 0} />
              <StatCard title="Total Account Balances" value={fmt(totalAccountBalances, currency)} />
            </div>

            {/* Chart + projection */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              <Card className="rounded-2xl card-glow w-full min-w-0">
                <CardHeader className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <CardTitle>Income vs Expenses (by month)</CardTitle>
                  </div>

                  {/* Chart Filters: Year + Month */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-40">
                      <Select value={chartYear} onValueChange={setChartYear}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Year" />
                        </SelectTrigger>
                        <SelectContent>
                          {allYearsInData.length === 0 && <SelectItem value={currentYear}>{currentYear}</SelectItem>}
                          {allYearsInData.map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-40">
                      <Select value={chartMonth} onValueChange={setChartMonth}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Month" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Months</SelectItem>
                          {MONTH_LABELS.map((m) => (
                            <SelectItem key={m} value={m}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="h-72 min-w-0">
                  <div className="w-full h-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mergedTrend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="xLabel" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="income" name="Income" stroke="#16a34a" strokeWidth={2.6} dot={false} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2.6} dot={false} />
                        <Line type="monotone" dataKey="investments" name="Investments" stroke="#a855f7" strokeWidth={2.6} dot={false} />
                        <Line type="monotone" dataKey="net" name="Net" stroke="#2563eb" strokeWidth={2.6} dot={false} strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Projection (Recurring vs Net)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border" style={{ background: "rgba(255,255,255,0.08)", borderColor: "var(--border)" }}>
                      <div className="text-sm text-muted-foreground">Recurring Expenses (monthly)</div>
                      <div className="text-2xl font-semibold">{fmt(projectedRecurringMonthly, currency)}</div>
                    </div>
                    <div className="p-4 rounded-xl border" style={{ background: "rgba(255,255,255,0.08)", borderColor: "var(--border)" }}>
                      <div className="text-sm text-muted-foreground">Required for Goals (monthly)</div>
                      <div className="text-2xl font-semibold">{fmt(requiredForGoalsMonthly, currency)}</div>
                    </div>
                  </div>
                  <div className="mt-4 p-4 rounded-xl border" style={{ background: "rgba(255,255,255,0.08)", borderColor: "var(--border)" }}>
                    <div className="text-sm text-muted-foreground">Available for Goals ({fmtMonth(selectedMonth)})</div>
                    <div className="text-2xl font-semibold">{fmt(availableForGoalsThisMonth, currency)}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* INCOME */}
          <TabsContent value="income" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <CaptureIncome onAdd={addIncome} currency={currency} accounts={store.accounts} />
              <Card className="md:col-span-2 rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Income — {fmtMonth(selectedMonth)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {editingIncomeId && (
                    <EditIncomeForm
                      key={editingIncomeId}
                      income={store.incomes.find((i) => i.id === editingIncomeId)!}
                      accounts={store.accounts}
                      currency={currency}
                      onCancel={() => setEditingIncomeId(null)}
                      onSave={(upd) => { updateIncome(upd); setEditingIncomeId(null); }}
                    />
                  )}
                  <TableList
                    headers={["Date", "Source", "Account", "Amount", "Notes", "Actions"]}
                    rows={monthIncomes.map((i) => [
                      i.date,
                      i.source,
                      store.accounts.find((a) => a.id === i.accountId)?.name || "—",
                      fmt(i.amount, currency),
                      i.notes || "—",
                      <div className="flex items-center gap-1" key={i.id}>
                        <Button variant="ghost" size="icon" onClick={() => setEditingIncomeId(i.id)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => delIncome(i.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>,
                    ])}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* EXPENSES */}
          <TabsContent value="expenses" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <CaptureExpense onAdd={addExpense} currency={currency} accounts={store.accounts} />
              <Card className="md:col-span-2 rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Expenses — {fmtMonth(selectedMonth)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {editingExpenseId && (
                    <EditExpenseForm
                      key={editingExpenseId}
                      expense={store.expenses.find((e) => e.id === editingExpenseId)!}
                      accounts={store.accounts}
                      currency={currency}
                      onCancel={() => setEditingExpenseId(null)}
                      onSave={(upd) => { updateExpense(upd); setEditingExpenseId(null); }}
                    />
                  )}
                  <TableList
                    headers={["Date", "Category", "Account", "Amount", "Recurring", "Notes", "Actions"]}
                    rows={monthExpensesForDisplay.map((e) => [
                      e.date,
                      e.category,
                      store.accounts.find((a) => a.id === e.accountId)?.name || "—",
                      fmt(e.amount, currency),
                      e.isRecurring || e.recurrence?.enabled ? (e.recurrence?.period ? e.recurrence.period : "Yes") : "No",
                      e.notes || "—",
                      <div className="flex items-center gap-1" key={e.id}>
                        {!String(e.id).includes("__proj__") && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => setEditingExpenseId(e.id)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => delExpense(e.id)} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {String(e.id).includes("__proj__") && (
                          <span className="text-xs text-muted-foreground">(Projected)</span>
                        )}
                      </div>,
                    ])}
                  />
                  <div className="text-xs text-muted-foreground mt-3">
                    Projected rows come from recurring settings and do not affect balances until actually recorded.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ACCOUNTS */}
          <TabsContent value="accounts" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <ManageAccounts accounts={store.accounts} onAdd={addAccount} onDelete={delAccount} currency={currency} />

              {/* Transfers */}
              <Card className="rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowLeftRight className="h-5 w-5" /> Transfer Between Accounts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TransferForm accounts={store.accounts} currency={currency} onAdd={addTransfer} />
                  {/* Edit transfer */}
                  {editingTransferId && (
                    <EditTransferForm
                      key={editingTransferId}
                      transfer={store.transfers.find((t) => t.id === editingTransferId)!}
                      accounts={store.accounts}
                      currency={currency}
                      onCancel={() => setEditingTransferId(null)}
                      onSave={(upd) => { updateTransfer(upd); setEditingTransferId(null); }}
                    />
                  )}
                  {/* Transfer table for selected month */}
                  {store.transfers.some((t) => ymKey(t.date) === month) && (
                    <div className="mt-4">
                      <TableList
                        headers={["Date", "From → To", "Amount", "Notes", "Actions"]}
                        rows={store.transfers
                          .filter((t) => ymKey(t.date) === month)
                          .map((t) => {
                            const from = store.accounts.find((a) => a.id === t.fromAccountId)?.name || "—";
                            const to = store.accounts.find((a) => a.id === t.toAccountId)?.name || "—";
                            return [
                              t.date,
                              `${from} → ${to}`,
                              fmt(t.amount, currency),
                              t.notes || "—",
                              <div className="flex items-center gap-1" key={t.id}>
                                <Button variant="ghost" size="icon" title="Edit transfer" onClick={() => setEditingTransferId(t.id)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Delete transfer" onClick={() => delTransfer(t.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>,
                            ];
                          })}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2 rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Account Transactions — {fmtMonth(selectedMonth)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <TableList
                    headers={["Date", "Account", "Type", "From/To", "Amount", "Notes"]}
                    rows={monthAccountTxns.map((t) => {
                      const accName = store.accounts.find((a) => a.id === t.accountId)?.name || "—";
                      let ref = "";
                      if (t.linkedType === "Income") {
                        ref = store.incomes.find((i) => i.id === t.linkedId)?.source || "Income";
                      } else if (t.linkedType === "Expense") {
                        ref = store.expenses.find((e) => e.id === t.linkedId)?.category || "Expense";
                      } else {
                        const from = store.accounts.find((a) => a.id === t.transferFromId)?.name || "—";
                        const to = store.accounts.find((a) => a.id === t.transferToId)?.name || "—";
                        ref = `${from} → ${to}`;
                      }
                      const typeLabel = t.linkedType === "Transfer" ? "Transfer" : t.type;
                      return [t.date, accName, typeLabel, ref, fmt(t.amount, currency), t.notes || "—"];
                    })}
                  />
                  <div className="text-xs text-muted-foreground mt-3">
                    Note: Transactions are created/updated automatically when you add/edit income, expenses, or transfers.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PROJECTS / GOALS */}
          <TabsContent value="projects" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <CaptureProject onAdd={addProject} />
              <Card className="rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Projects/Goals</CardTitle>
                </CardHeader>
                <CardContent>
                  <TableList
                    headers={["Name", "Target", "Target Date", "Actions"]}
                    rows={store.projects.map((p) => [
                      p.name,
                      fmt(p.targetAmount, currency),
                      p.targetDate,
                      <Button variant="ghost" size="icon" onClick={() => delProject(p.id)} key={p.id}>
                        <Trash2 className="h-4 w-4" />
                      </Button>,
                    ])}
                  />
                </CardContent>
              </Card>

              <Card className="md:col-span-2 rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Goal Contributions & Required Monthly</CardTitle>
                </CardHeader>
                <CardContent>
                  <CaptureProjectContribution projects={store.projects} onAdd={addProjectContribution} currency={currency} />
                  <div className="mt-4" />
                  <TableList
                    headers={["Project", "Contributed", "Remaining", "Months Left", "Required/Month"]}
                    rows={store.projects.map((p) => {
                      const s = projectStats.find((x) => x.project.id === p.id)!;
                      return [p.name, fmt(s.contributed, currency), fmt(s.remaining, currency), s.monthsLeft.toString(), fmt(s.requiredMonthly, currency)];
                    })}
                  />
                  <div className="mt-4 p-4 rounded-xl border text-sm text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", borderColor: "var(--border)" }}>
                    Tip: “Required/Month” shows how much you should set aside monthly from now until the target date to reach each goal.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* INVESTMENTS */}
          <TabsContent value="investments" className="mt-6">
            <div className="grid md:grid-cols-3 gap-4">
              <CaptureInvestment onAdd={addInvestment} currency={currency} accounts={store.accounts} />
              <Card className="md:col-span-2 rounded-2xl card-glow">
                <CardHeader>
                  <CardTitle>Investments (All)</CardTitle>
                </CardHeader>
                <CardContent>
                  <TableList
                    headers={["Date", "Instrument", "Account", "Amount", "Notes", "Actions"]}
                    rows={store.investments.map((v) => [
                      v.date,
                      v.instrument,
                      v.accountId ? (store.accounts.find((a) => a.id === v.accountId)?.name || "—") : "—",
                      fmt(v.amount, currency),
                      v.notes || "—",
                      <Button key={v.id} variant="ghost" size="icon" onClick={() => delInvestment(v.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>,
                    ])}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Auth panel removed in favor of header controls */}
      </div>
    </div>
  );
}

/* ===========================
   Reusable bits
=========================== */
function StatCard({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <Card
      className={`rounded-2xl card-glow ${highlight ? "ring-2" : ""}`}
      style={highlight ? { boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 10px 28px rgba(52,211,153,0.22)" } : undefined}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function TableList({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-muted-foreground" colSpan={headers.length}>
                No records yet.
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="transition-colors hover:bg-[rgba(255,255,255,0.04)]">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 border-b align-top" style={{ borderColor: "var(--border)" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===========================
   Forms
=========================== */
function CaptureIncome({
  onAdd,
  currency,
  accounts,
}: {
  onAdd: (inc: Omit<Income, "id">) => void;
  currency: Currency;
  accounts: Account[];
}) {
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts]);

  const add = () => {
    if (!source || !amount || !accountId) return;
    onAdd({ source, amount: parseNum(amount), date, accountId, notes });
    setSource("");
    setAmount("");
    setNotes("");
  };

  return (
    <Card className="rounded-2xl card-glow">
      <CardHeader>
        <CardTitle>Capture Income</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Source</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g., Salary, Freelance" />
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Paid into Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <Button onClick={add} className="w-full btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Income
        </Button>
      </CardContent>
    </Card>
  );
}

function CaptureExpense({
  onAdd,
  currency,
  accounts,
}: {
  onAdd: (exp: Omit<Expense, "id">) => void;
  currency: Currency;
  accounts: Account[];
}) {
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [isRecurring, setRecurring] = useState(false);

  // NEW recurrence UI
  const [recEnabled, setRecEnabled] = useState(false);
  const [recPeriod, setRecPeriod] = useState<RecurrencePeriod>("monthly");
  const [recStart, setRecStart] = useState(todayISO());
  const [recEnd, setRecEnd] = useState<string>("");

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts]);

  useEffect(() => {
    // keep simple toggle in sync
    setRecurring(recEnabled);
  }, [recEnabled]);

  const add = () => {
    if (!category || !amount || !accountId) return;
    const base: Omit<Expense, "id"> = {
      category,
      amount: parseNum(amount),
      date,
      notes,
      isRecurring,
      accountId,
      recurrence: recEnabled ? { enabled: true, period: recPeriod, start: recStart, end: recEnd || undefined } : undefined,
    };
    onAdd(base);
    setCategory("");
    setAmount("");
    setNotes("");
    setRecurring(false);
    setRecEnabled(false);
    setRecPeriod("monthly");
    setRecStart(todayISO());
    setRecEnd("");
  };

  return (
    <Card className="rounded-2xl card-glow">
      <CardHeader>
        <CardTitle>Capture Expense</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Rent, Food, Transport" />
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* Recurrence */}
        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <Label className="mr-2">Recurring?</Label>
              <div className="text-xs text-muted-foreground">Will auto-project into future months</div>
            </div>
            <Switch checked={recEnabled} onCheckedChange={setRecEnabled} />
          </div>

          {recEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Period</Label>
                <Select value={recPeriod} onValueChange={(v) => setRecPeriod(v as RecurrencePeriod)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Start</Label>
                <Input type="date" value={recStart} onChange={(e) => setRecStart(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>End (optional)</Label>
                <Input type="date" value={recEnd} onChange={(e) => setRecEnd(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label>Paid from Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <Button onClick={add} className="w-full btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </CardContent>
    </Card>
  );
}

function ManageAccounts({
  accounts,
  onAdd,
  onDelete,
  currency,
}: {
  accounts: Account[];
  onAdd: (a: Omit<Account, "id">) => void;
  onDelete: (id: Id) => void;
  currency: Currency;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("Savings");
  const [balance, setBalance] = useState("");

  const add = () => {
    if (!name) return;
    onAdd({ name, type, balance: parseNum(balance || "0"), currency });
    setName("");
    setBalance("");
  };

  return (
    <Card className="rounded-2xl card-glow">
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Equity Bank, M-Pesa, Binance" />
        </div>
        <div className="grid gap-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Savings">Savings</SelectItem>
              <SelectItem value="Investment">Investment</SelectItem>
              <SelectItem value="Wallet">Wallet</SelectItem>
              <SelectItem value="Bank">Bank</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Starting Balance ({currency})</Label>
          <Input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
        </div>
        <Button onClick={add} className="w-full btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Account
        </Button>

        <div className="mt-4">
          <TableList
            headers={["Name", "Type", "Balance", "Actions"]}
            rows={accounts.map((a) => [
              a.name,
              a.type,
              fmt(a.balance, currency),
              <Button variant="ghost" size="icon" onClick={() => onDelete(a.id)} key={a.id}>
                <Trash2 className="h-4 w-4" />
              </Button>,
            ])}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TransferForm({
  accounts,
  currency,
  onAdd,
}: {
  accounts: Account[];
  currency: Currency;
  onAdd: (t: Omit<Transfer, "id">) => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id || "");
  const [toId, setToId] = useState(accounts[1]?.id || accounts[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!fromId && accounts[0]) setFromId(accounts[0].id);
    if (!toId && accounts[1]) setToId(accounts[1].id);
  }, [accounts]);

  const submit = () => {
    const amt = parseNum(amount);
    if (!fromId || !toId || fromId === toId || !(amt > 0)) return;
    onAdd({ fromAccountId: fromId, toAccountId: toId, amount: amt, date, notes });
    setAmount("");
    setNotes("");
  };

  return (
    <div className="grid md:grid-cols-6 gap-3 items-end">
      <div className="grid gap-2 md:col-span-2">
        <Label>From</Label>
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger><SelectValue placeholder="From account" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>To</Label>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger><SelectValue placeholder="To account" /></SelectTrigger>
          <SelectContent>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Amount ({currency})</Label>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="grid gap-2">
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="grid gap-2 md:col-span-6">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional (e.g., Move to savings)" />
      </div>
      <div className="md:col-span-6">
        <Button onClick={submit} className="btn-gradient">
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          Make Transfer
        </Button>
      </div>
      <div className="text-xs text-muted-foreground md:col-span-6">
        Transfers do not affect Income/Expenses totals; they only move money between your accounts.
      </div>
    </div>
  );
}

/* ===========================
   Projects / Goals Forms
=========================== */
function CaptureProject({ onAdd }: { onAdd: (p: Omit<Project, "id">) => void }) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [notes, setNotes] = useState("");

  const add = () => {
    if (!name || !targetAmount || !targetDate) return;
    onAdd({ name, targetAmount: parseNum(targetAmount), targetDate, notes });
    setName("");
    setTargetAmount("");
    setTargetDate("");
    setNotes("");
  };

  return (
    <Card className="rounded-2xl card-glow">
      <CardHeader>
        <CardTitle>New Project / Goal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., School fees, New laptop, Holiday" />
        </div>
        <div className="grid gap-2">
          <Label>Target Amount</Label>
          <Input inputMode="decimal" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="grid gap-2">
          <Label>Target Date</Label>
          <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
        </div>
        <Button onClick={add} className="w-full btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Goal
        </Button>
      </CardContent>
    </Card>
  );
}

function CaptureProjectContribution({
  projects,
  onAdd,
  currency,
}: {
  projects: Project[];
  onAdd: (c: Omit<ProjectContribution, "id">) => void;
  currency: Currency;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projects]);

  const add = () => {
    if (!projectId || !amount) return;
    onAdd({ projectId, amount: parseNum(amount), date });
    setAmount("");
  };

  return (
    <div className="grid md:grid-cols-5 gap-3 items-end">
      <div className="grid gap-2 md:col-span-2">
        <Label>Project</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Amount ({currency})</Label>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
      </div>
      <div className="grid gap-2">
        <Label>Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="md:col-span-5">
        <Button onClick={add} className="btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Record Contribution
        </Button>
      </div>
    </div>
  );
}

/* ===========================
   Investments Form
=========================== */
function CaptureInvestment({
  onAdd,
  currency,
  accounts,
}: {
  onAdd: (v: Omit<Investment, "id">) => void;
  currency: Currency;
  accounts: Account[];
}) {
  const [instrument, setInstrument] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || "");
  const [isContribution, setIsContribution] = useState(true);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts]);

  const add = () => {
    const amt = parseNum(amount || "0");
    if (!instrument || !amt) return;
    const signed = isContribution ? +amt : -amt;
    onAdd({ instrument, amount: signed, date, accountId, notes });
    setInstrument("");
    setAmount("");
    setNotes("");
    setIsContribution(true);
  };

  return (
    <Card className="rounded-2xl card-glow">
      <CardHeader>
        <CardTitle>Record Investment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Instrument</Label>
          <Input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="e.g., MMF, Bonds, ETF" />
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Funded From Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div className="text-sm">
            <div className="font-medium">{isContribution ? "Contribution" : "Withdrawal"}</div>
            <div className="text-xs text-muted-foreground">
              Contribution reduces the funding account; Withdrawal increases it.
            </div>
          </div>
          <Switch checked={isContribution} onCheckedChange={setIsContribution} />
        </div>
        <div className="grid gap-2">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <Button onClick={add} className="w-full btn-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Investment
        </Button>
      </CardContent>
    </Card>
  );
}

/* ===========================
   Edit Forms
=========================== */
function EditIncomeForm({
  income,
  accounts,
  currency,
  onSave,
  onCancel,
}: {
  income: Income;
  accounts: Account[];
  currency: Currency;
  onSave: (upd: Income) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState(income.source);
  const [amount, setAmount] = useState(String(income.amount));
  const [date, setDate] = useState(income.date);
  const [accountId, setAccountId] = useState(income.accountId);
  const [notes, setNotes] = useState(income.notes || "");

  return (
    <Card className="mb-4 rounded-2xl border-2">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Edit Income</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-5 gap-3">
        <div className="grid gap-2">
          <Label>Source</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 md:col-span-5">
          <Button onClick={() => onSave({ ...income, source, amount: parseNum(amount), date, accountId, notes })} className="btn-gradient">
            <Check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditExpenseForm({
  expense,
  accounts,
  currency,
  onSave,
  onCancel,
}: {
  expense: Expense;
  accounts: Account[];
  currency: Currency;
  onSave: (upd: Expense) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(expense.category);
  const [amount, setAmount] = useState(String(expense.amount));
  const [date, setDate] = useState(expense.date);
  const [accountId, setAccountId] = useState(expense.accountId);
  const [notes, setNotes] = useState(expense.notes || "");
  const [recEnabled, setRecEnabled] = useState<boolean>(expense.recurrence?.enabled ?? expense.isRecurring);
  const [recPeriod, setRecPeriod] = useState<RecurrencePeriod>(expense.recurrence?.period ?? "monthly");
  const [recStart, setRecStart] = useState<string>(expense.recurrence?.start ?? expense.date);
  const [recEnd, setRecEnd] = useState<string>(expense.recurrence?.end ?? "");

  return (
    <Card className="mb-4 rounded-2xl border-2">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Edit Expense</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-5 gap-3">
        <div className="grid gap-2">
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Account</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Recurrence */}
        <div className="grid gap-2">
          <Label>Recurring?</Label>
          <div className="rounded-lg border px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Auto-project into future months</span>
              <Switch checked={recEnabled} onCheckedChange={setRecEnabled} />
            </div>
            {recEnabled && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Period</Label>
                  <Select value={recPeriod} onValueChange={(v) => setRecPeriod(v as RecurrencePeriod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Start</Label>
                  <Input type="date" value={recStart} onChange={(e) => setRecStart(e.target.value)} />
                </div>
                <div className="grid gap-1 col-span-2">
                  <Label className="text-xs">End (optional)</Label>
                  <Input type="date" value={recEnd} onChange={(e) => setRecEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-2 md:col-span-5">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 md:col-span-5">
          <Button
            onClick={() =>
              onSave({
                ...expense,
                category,
                amount: parseNum(amount),
                date,
                accountId,
                notes,
                isRecurring: recEnabled,
                recurrence: recEnabled ? { enabled: true, period: recPeriod, start: recStart, end: recEnd || undefined } : undefined,
              })
            }
            className="btn-gradient"
          >
            <Check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EditTransferForm({
  transfer,
  accounts,
  currency,
  onSave,
  onCancel,
}: {
  transfer: Transfer;
  accounts: Account[];
  currency: Currency;
  onSave: (upd: Transfer) => void;
  onCancel: () => void;
}) {
  const [fromId, setFromId] = useState(transfer.fromAccountId);
  const [toId, setToId] = useState(transfer.toAccountId);
  const [amount, setAmount] = useState(String(transfer.amount));
  const [date, setDate] = useState(transfer.date);
  const [notes, setNotes] = useState(transfer.notes || "");

  const save = () => {
    const amt = parseNum(amount);
    if (!fromId || !toId || fromId === toId || !(amt > 0)) return;
    onSave({ ...transfer, fromAccountId: fromId, toAccountId: toId, amount: amt, date, notes });
  };

  return (
    <Card className="mt-4 rounded-2xl border-2">
      <CardHeader className="py-3">
        <CardTitle className="text-base">Edit Transfer</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-6 gap-3">
        <div className="grid gap-2 md:col-span-2">
          <Label>From</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>To</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Amount ({currency})</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2 md:col-span-6">
          <Label>Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 md:col-span-6">
          <Button onClick={save} className="btn-gradient">
            <Check className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ===========================
   Supabase Test Panel (no extra "use client")
=========================== */
function AuthCard({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSignIn = async () => {
    try {
      setBusy(true); setError(null);
      await signIn(email, password);
      await onSignedIn();
    } catch (e: any) {
      setError(e?.message || "Failed to sign in");
    } finally { setBusy(false); }
  };
  const doSignUp = async () => {
    try {
      setBusy(true); setError(null);
      await signUp(email, password);
      await onSignedIn();
    } catch (e: any) {
      setError(e?.message || "Failed to sign up");
    } finally { setBusy(false); }
  };

  return (
    <Card className="w-full max-w-sm rounded-2xl">
      <CardHeader>
        <CardTitle>Sign in to continue</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Password</Label>
          <Input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={doSignIn} disabled={busy}>Sign In</Button>
          <Button className="flex-1" variant="outline" onClick={doSignUp} disabled={busy}>Sign Up</Button>
        </div>
      </CardContent>
    </Card>
  );
}
