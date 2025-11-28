import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const rows = db.prepare("select * from project_contributions order by date desc, id desc").all();
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const id = body.id || crypto.randomUUID();
  const { project_id, date, amount } = body;
  const db = getDB();
  db.prepare(
    "insert into project_contributions (id,project_id,date,amount) values (@id,@pid,@date,@amount)"
  ).run({ id, pid: project_id, date, amount: Number(amount) });
  const row = db.prepare("select * from project_contributions where id=@id").get({ id });
  return NextResponse.json(row, { status: 201 });
}

