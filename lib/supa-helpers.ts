// lib/supa-helpers.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
if (!url) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!anon) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");

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

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/* ---------- WORKSPACE ---------- */
export async function ensureWorkspace(name: string) {
  const user = await getUser();
  if (!user) throw new Error("No auth user");

  // Try find existing
  const { data: existing, error: selErr } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_uid", user.id)
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("workspaces")
    .insert({ name, owner_uid: user.id })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

/* ---------- ACCOUNTS ---------- */
export type NewAccount = {
  name: string;
  type: "Savings" | "Investment" | "Wallet" | "Bank";
  currency: string;
  balance: number;
};

export async function addAccountSupabase(workspaceId: string, a: NewAccount) {
  const { error } = await supabase.from("accounts").insert({ ...a, workspace_id: workspaceId });
  if (error) throw error;
}

export async function listAccountsSupabase(workspaceId: string) {
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/* ---------- TRANSACTIONS (simple test table) ---------- */
export type NewTransaction = {
  workspace_id: string;
  account_id: string;
  trx_date: string; // yyyy-mm-dd
  amount: number;
  description?: string;
  currency: string;
  category_id?: string | null;
};

export async function addTransactionSupabase(t: NewTransaction) {
  const { error } = await supabase.from("transactions").insert(t);
  if (error) throw error;
}

export async function listTransactionsSupabase(workspaceId: string, limit = 50) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("trx_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function deleteTransactionSupabase(workspaceId: string, id: string) {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

export async function updateTransactionSupabase(
  workspaceId: string,
  id: string,
  patch: Partial<{ trx_date: string; amount: number; description?: string | null; currency: string; account_id: string; category_id?: string | null }>
) {
  const { error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

/* ---------- TRANSFERS ---------- */
export type NewTransfer = {
  workspace_id: string;
  trx_date: string; // yyyy-mm-dd
  from_account_id: string;
  to_account_id: string;
  amount: number;
  notes?: string | null;
};

export async function addTransferSupabase(t: NewTransfer) {
  const { error } = await supabase.from("transfers").insert(t);
  if (error) throw error;
}

export async function listTransfersSupabase(workspaceId: string) {
  const { data, error } = await supabase
    .from("transfers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("trx_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateTransferSupabase(
  workspaceId: string,
  id: string,
  patch: Partial<{ trx_date: string; from_account_id: string; to_account_id: string; amount: number; notes?: string | null }>
) {
  const { error } = await supabase
    .from("transfers")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTransferSupabase(workspaceId: string, id: string) {
  const { error } = await supabase.from("transfers").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
}

/* ---------- PROJECTS / GOALS ---------- */
export type NewProject = {
  workspace_id: string;
  name: string;
  target_amount: number;
  target_date: string; // yyyy-mm-dd
  notes?: string | null;
};

export async function addProjectSupabase(p: NewProject) {
  const { error } = await supabase.from("projects").insert(p);
  if (error) throw error;
}

export async function listProjectsSupabase(workspaceId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("target_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateProjectSupabase(workspaceId: string, id: string, patch: Partial<{ name: string; target_amount: number; target_date: string; notes?: string | null }>) {
  const { error } = await supabase.from("projects").update(patch).eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
}

export async function deleteProjectSupabase(workspaceId: string, id: string) {
  const { error } = await supabase.from("projects").delete().eq("workspace_id", workspaceId).eq("id", id);
  if (error) throw error;
}

/* contributions */
export type NewProjectContribution = {
  workspace_id: string;
  project_id: string;
  date: string; // yyyy-mm-dd
  amount: number;
};

export async function addProjectContributionSupabase(c: NewProjectContribution) {
  const { error } = await supabase.from("project_contributions").insert(c);
  if (error) throw error;
}

export async function listProjectContributionsSupabase(workspaceId: string) {
  const { data, error } = await supabase
    .from("project_contributions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteProjectContributionSupabase(workspaceId: string, id: string) {
  const { error } = await supabase
    .from("project_contributions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

export async function updateProjectContributionSupabase(workspaceId: string, id: string, patch: Partial<{ date: string; amount: number }>) {
  const { error } = await supabase
    .from("project_contributions")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

/* ---------- INVESTMENT updates ---------- */
export async function updateInvestmentSupabase(workspaceId: string, id: string, patch: Partial<{ inv_date: string; instrument: string; amount: number; notes?: string | null; account_id?: string | null }>) {
  const { error } = await supabase
    .from("investments")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw error;
}

/* ---------- EXPENSES with recurrence ---------- */
export type RecurrencePeriod = "monthly" | "quarterly" | "annually";
export type NewExpense = {
  workspace_id: string;
  account_id: string;
  exp_date: string;         // yyyy-mm-dd
  category: string;
  amount: number;
  notes?: string;
  is_recurring?: boolean;
  rec_period?: RecurrencePeriod | null;
  rec_start?: string | null; // yyyy-mm-dd
  rec_end?: string | null;   // yyyy-mm-dd
};

export async function addExpenseSupabase(e: NewExpense) {
  const { error } = await supabase.from("expenses").insert(e);
  if (error) throw error;

  // Mirror your UI: adjust account balance immediately (withdrawal)
  const { error: upErr } = await supabase.rpc("adjust_account_balance", {
    p_account_id: e.account_id,
    p_delta: -Math.abs(e.amount),
  });
  // If you haven't created this RPC yet, comment the above and use a direct update:
  // const { error: upErr } = await supabase
  //   .from("accounts")
  //   .update({ balance: supabase.raw(`balance - ${Math.abs(e.amount)}`) })
  //   .eq("id", e.account_id);
  if (upErr) console.warn("Balance adjust error (expense):", upErr.message);
}

export async function listExpensesSupabase(
  workspaceId: string,
  opts?: { from?: string; to?: string; limit?: number }
) {
  let q = supabase.from("expenses").select("*").eq("workspace_id", workspaceId);
  if (opts?.from) q = q.gte("exp_date", opts.from);
  if (opts?.to) q = q.lte("exp_date", opts.to);
  q = q.order("exp_date", { ascending: false }).limit(opts?.limit ?? 200);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function deleteExpenseSupabase(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- INVESTMENTS (pos = contribution, neg = withdrawal) ---------- */
export type NewInvestment = {
  workspace_id: string;
  account_id?: string | null;
  inv_date: string;     // yyyy-mm-dd
  instrument: string;
  amount: number;       // +contribution reduces funding account; -withdrawal increases
  notes?: string;
};

export async function addInvestmentSupabase(v: NewInvestment) {
  const { error } = await supabase.from("investments").insert(v);
  if (error) throw error;

  if (v.account_id) {
    const delta = v.amount > 0 ? -Math.abs(v.amount) : Math.abs(v.amount);
    // const { error: upErr } = await supabase.rpc("adjust_account_balance", {
    //   p_account_id: v.account_id,
    //   p_delta: delta,
    // });
    // // See note above if you don't have RPC
    // if (upErr) console.warn("Balance adjust error (investment):", upErr.message);
  }
}

export async function listInvestmentsSupabase(workspaceId: string) {
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("inv_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function deleteInvestmentSupabase(id: string) {
  const { error } = await supabase.from("investments").delete().eq("id", id);
  if (error) throw error;
}

/* ---------- Optional: Postgres helper for balance updates ---------- */
/*
Create this RPC once in SQL editor:

create or replace function adjust_account_balance(p_account_id uuid, p_delta numeric)
returns void
language plpgsql
as $$
begin
  update accounts set balance = coalesce(balance,0) + coalesce(p_delta,0)
  where id = p_account_id;
end;
$$;

grant execute on function adjust_account_balance(uuid, numeric) to anon, authenticated, service_role;
*/
