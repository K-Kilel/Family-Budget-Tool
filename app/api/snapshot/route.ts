import { NextResponse } from "next/server";
import { getDB, listAll } from "@/lib/db";

export async function GET() {
  const db = getDB();
  const all = listAll(db);
  return NextResponse.json(all);
}

