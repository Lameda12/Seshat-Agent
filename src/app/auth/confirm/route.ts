import { NextRequest, NextResponse } from "next/server";
import { database } from "../../../lib/server";
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code && code.length <= 4096) {
    const db = await database();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(
        new URL("/account", process.env.APP_ORIGIN!),
      );
  }
  return new Response("Sign-in link invalid or expired", { status: 400 });
}
