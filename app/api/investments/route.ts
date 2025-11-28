import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from investments order by inv_date desc, id desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { inv_date, instrument, amount, account_id, notes } = body;
  const db = getDB();
  db.prepare(
    "insert into investments (id,inv_date,instrument,amount,account_id,notes) values (@id,@date,@inst,@amount,@account_id,@notes)"
  ).run({ id, date: inv_date, inst: instrument, amount: Number(amount), account_id: account_id ?? null, notes });
  const row = db.prepare("select * from investments where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

