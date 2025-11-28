import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { id } = params;
  const db = getDB();
  const set: string[] = [];
  const values: Record<string, unknown> = { id };
  for (const key of ["trx_date", "amount", "description", "currency", "account_id", "category_id"]) {
    if (key in body) {
      set.push(`${key}=@${key}`);
      values[key] = key === "amount" ? Number(body[key]) : body[key];
    }
  }
  if (set.length) db.prepare(`update transactions set ${set.join(",")} where id=@id`).run(values);
  const row = db.prepare("select * from transactions where id=@id").get({ id });
  return NextResponse.json(row);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getDB();
  db.prepare("delete from transactions where id=@id").run({ id });
  return NextResponse.json({ ok: true });
}

