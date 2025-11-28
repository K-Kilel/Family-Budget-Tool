import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from transfers order by trx_date desc, id desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { trx_date, from_account_id, to_account_id, amount, notes } = body;
  const db = getDB();
  db.prepare(
    "insert into transfers (id,trx_date,from_account_id,to_account_id,amount,notes) values (@id,@trx_date,@from,@to,@amount,@notes)"
  ).run({ id, trx_date, from: from_account_id, to: to_account_id, amount: Number(amount), notes });
  const row = db.prepare("select * from transfers where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

