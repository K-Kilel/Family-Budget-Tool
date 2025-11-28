import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const db = getDB();
  db.prepare("delete from projects where id=@id").run({ id });
  return NextResponse.json({ ok: true });
}

