import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { id } = params;
  const db = getDB();
  const set: string[] = [];
  const values: Record<string, unknown> = { id };
  const map: Record<string, string> = {
    from_account_id: "from_account_id",
    to_account_id: "to_account_id",
    trx_date: "trx_date",
    amount: "amount",
    notes: "notes",
  };
  for (const key in map) {
    if (key in body) {
      set.push(`${map[key]}=@${map[key]}`);
      values[map[key]] = key === "amount" ? Number(body[key]) : body[key];
    }
  }
  if (set.length) db.prepare(`update transfers set ${set.join(",")} where id=@id`).run(values);
  const row = db.prepare("select * from transfers where id=@id").get({ id });
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getDB();
  db.prepare("delete from transfers where id=@id").run({ id });
  return NextResponse.json({ ok: true });
}

