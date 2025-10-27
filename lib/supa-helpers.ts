// lib/supa-helpers.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url) {
  throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
}
if (!anon) {
  throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* ---------- AUTH ---------- */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

/* ---------- WORKSPACE ---------- */
export async function ensureWorkspace(name = "My Budget"): Promise<string> {
  const { data: session } = await supabase.auth.getUser();
  const user = session.user;
  if (!user) throw new Error("Not signed in");

  const { data: mem, error: e1 } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1);
  if (e1) throw e1;
  if (mem && mem.length) return mem[0].workspace_id;

  const { data: ws, error: e2 } = await supabase
    .from("workspaces")
    .insert({ name })
    .select("id")
    .single();
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner" });
  if (e3) throw e3;

  return ws.id;
}

/* ---------- ACCOUNTS ---------- */
export type SAccount = {
  id: string;
  name: string;
  type: "Savings" | "Investment" | "Wallet" | "Bank";
  currency: string;
  balance: number;
};

export async function listAccountsSupabase(workspace_id: string): Promise<SAccount[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,type,currency,balance")
    .eq("workspace_id", workspace_id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addAccountSupabase(workspace_id: string, a: Omit<SAccount, "id">) {
  const { error } = await supabase.from("accounts").insert({ ...a, workspace_id });
  if (error) throw error;
}

export async function deleteAccountSupabase(workspace_id: string, id: string) {
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("workspace_id", workspace_id);
  if (error) throw error;
}

/* ---------- TRANSACTIONS ---------- */
export type STransaction = {
  id: string;
  trx_date: string; // 'YYYY-MM-DD'
  amount: number;   // +inflow, -outflow
  description?: string | null;
  account_id: string;
  category_id?: string | null;
  currency: string;
};

export async function addTransactionSupabase(input: Omit<STransaction, "id"> & { workspace_id: string }) {
  const { error } = await supabase.from("transactions").insert(input);
  if (error) throw error;
}

export async function listTransactionsSupabase(workspace_id: string, limit = 20) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,trx_date,amount,description,currency,account_id,category_id")
    .eq("workspace_id", workspace_id)
    .order("trx_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
