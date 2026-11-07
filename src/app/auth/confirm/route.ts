import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/server";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const db = await database();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/account", req.url));
  }
  return new Response("Sign-in link invalid or expired", { status: 400 });
}
