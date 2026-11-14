import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, destroySession, sameOrigin } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) { try { await destroySession(token); } catch (e) { console.error("logout failed:", e instanceof Error ? e.message : e); } }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
