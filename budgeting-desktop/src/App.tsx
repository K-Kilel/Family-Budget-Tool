"use client";

import { useEffect, useState } from "react";
import {
  initTables,
  listAccounts,
  addAccount,
  deleteAccount,
  type Account,
} from "./lib/store-sqlite";

type Currency = "USD" | "KSH";
type AccountType = Account["type"]; // e.g. "Savings" | "Investment" | "Wallet" | "Bank"

type FormState = {
  name: string;
  type: AccountType;
  balance: string; // keep as string for the input, parse on save
  currency: Currency;
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState<FormState>({
    name: "",
    type: "Wallet",
    balance: "0",
    currency: "USD",
  });

  async function reload() {
    const rows = await listAccounts();
    setAccounts(rows);
  }

  useEffect(() => {
    (async () => {
      try {
        await initTables(); // ensure tables exist
        await reload();
      } catch (e) {
        console.error("App init failed:", e);
        alert(
          "Failed to initialize the database. Open the console for details."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onAdd() {
    if (!form.name.trim()) return;

    // Parse number safely
    const parsed = Number.parseFloat(form.balance.replace(/,/g, ""));
    const safeBalance = Number.isFinite(parsed) ? parsed : 0;

    try {
      await addAccount({
        name: form.name.trim(),
        type: form.type,
        balance: safeBalance,
        currency: form.currency,
      });

      setForm((f) => ({
        ...f,
        name: "",
        balance: "0",
        // Keep last-picked type & currency for faster entry
      }));

      await reload();
    } catch (e) {
      console.error("Add account failed:", e);
      alert("Could not add the account. Check console for details.");
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteAccount(id);
      await reload();
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Could not delete the account. Check console for details.");
    }
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;

  return (
    <div style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h1>Budgeting Desktop (SQLite)</h1>

      <h2 style={{ marginTop: 24 }}>Add Account</h2>
      <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
        <input
          placeholder="Name (e.g., Cash, M-Pesa)"
          value={form.name}
          onChange={(e) =>
            setForm((f) => ({ ...f, name: e.target.value }))
          }
        />

        <select
          value={form.type}
          onChange={(e) =>
            setForm((f) => ({ ...f, type: e.target.value as AccountType }))
          }
        >
          <option value="Savings">Savings</option>
          <option value="Investment">Investment</option>
          <option value="Wallet">Wallet</option>
          <option value="Bank">Bank</option>
        </select>

        <input
          type="number"
          inputMode="decimal"
          placeholder="Starting Balance"
          value={form.balance}
          onChange={(e) =>
            setForm((f) => ({ ...f, balance: e.target.value }))
          }
        />

        <select
          value={form.currency}
          onChange={(e) =>
            setForm((f) => ({ ...f, currency: e.target.value as Currency }))
          }
        >
          <option value="USD">USD</option>
          <option value="KSH">KSH</option>
        </select>

        <button onClick={onAdd} disabled={!form.name.trim()}>
          Add
        </button>
      </div>

      <h2 style={{ marginTop: 24 }}>Accounts</h2>
      {accounts.length === 0 && <div>No accounts yet.</div>}

      <ul>
        {accounts.map((a) => (
          <li key={a.id} style={{ marginBottom: 8 }}>
            <strong>{a.name}</strong> — {a.type} — {a.currency}{" "}
            {Number.isFinite(a.balance) ? a.balance.toFixed(2) : a.balance}{" "}
            <button
              onClick={() => onDelete(a.id)}
              style={{ marginLeft: 8 }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: 24, fontSize: 12, opacity: 0.7 }}>
        DB file lives in your OS app-data folder under{" "}
        <code>budgeting/budget.db</code>.
      </div>
    </div>
  );
}

