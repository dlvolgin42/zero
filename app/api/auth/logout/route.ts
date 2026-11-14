import { NextResponse, type NextRequest } from "next/server";
import { SAVED_COOKIE, SESSION_COOKIE, SESSION_DAYS, isProd, sameOrigin } from "@/lib/server/auth";

// Logging out only parks the session: the next "Войти" on this browser restores it without Telegram.
// The session stays valid on the server until it expires (60 days).
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  if (token) {
    res.cookies.set(SAVED_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/api/auth/telegram", maxAge: SESSION_DAYS * 86400 });
  }
  return res;
}
