import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from projects order by target_date asc, name asc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { name, target_amount, target_date, notes } = body;
  const db = getDB();
  db.prepare(
    "insert into projects (id,name,target_amount,target_date,notes) values (@id,@name,@amt,@date,@notes)"
  ).run({ id, name, amt: Number(target_amount), date: target_date, notes });
  const row = db.prepare("select * from projects where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

