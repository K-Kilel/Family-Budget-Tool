import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from transactions order by trx_date desc, id desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { trx_date, amount, description, currency, account_id, category_id } = body;
  const db = getDB();
  db.prepare(
    "insert into transactions (id,trx_date,amount,description,currency,account_id,category_id) values (@id,@trx_date,@amount,@description,@currency,@account_id,@category_id)"
  ).run({ id, trx_date, amount: Number(amount), description, currency, account_id, category_id });
  const row = db.prepare("select * from transactions where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

