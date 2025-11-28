import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from accounts order by created_at asc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { name, type, currency, balance } = body;
  const db = getDB();
  const stmt = db.prepare(
    "insert into accounts (id,name,type,currency,balance) values (@id,@name,@type,@currency,@balance)"
  );
  stmt.run({ id, name, type, currency, balance: Number(balance || 0) });
  const row = db.prepare("select * from accounts where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

