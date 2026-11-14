import type { NextRequest } from "next/server";
import { SESSION_COOKIE, currentProfile, sameOrigin } from "./auth";
import { hasDatabase } from "./db";
import { HttpError } from "./data";

// One wrapper for every data route: checks the database, the origin (for changes) and the session, parses JSON,
// and turns known errors into clean responses.
export async function withMe(request: NextRequest, fn: (me: string, body: unknown) => Promise<unknown>, successStatus = 200) {
  // Request data is read first, outside try/catch: Next uses a thrown signal to mark GET routes as request-time.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isRead = request.method === "GET";
  const sameSite = isRead || sameOrigin(request);
  if (!hasDatabase()) return Response.json({ error: "no_database" }, { status: 503 });
  if (!sameSite) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const profile = await currentProfile(token);
    if (!profile) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = isRead ? null : await request.json().catch(() => null);
    const data = await fn(profile.id, body);
    return Response.json(data ?? { ok: true }, { status: successStatus });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.code }, { status: e.status });
    console.error(`${request.method} ${request.nextUrl.pathname} failed:`, e instanceof Error ? e.message : e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
