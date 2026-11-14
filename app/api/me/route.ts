import type { NextRequest } from "next/server";
import { SESSION_COOKIE, currentProfile, sameOrigin } from "@/lib/server/auth";
import { NoDatabaseError, db, hasDatabase } from "@/lib/server/db";

// 200 + profile, 401 not logged in, 503 no database (local development without one).
export async function GET(request: NextRequest) {
  // Read the request first, outside try/catch: Next uses a thrown signal to mark this route as request-time.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!hasDatabase()) return Response.json({ error: "no_database" }, { status: 503 });
  try {
    const me = await currentProfile(token);
    return me ? Response.json(me) : Response.json({ error: "unauthorized" }, { status: 401 });
  } catch (e) {
    if (e instanceof NoDatabaseError) return Response.json({ error: "no_database" }, { status: 503 });
    console.error("GET /api/me failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}

// Change your own name and/or avatar.
export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const me = await currentProfile(request.cookies.get(SESSION_COOKIE)?.value);
    if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; avatarSeed?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : undefined;
    const seed = typeof body.avatarSeed === "string" ? body.avatarSeed.trim().slice(0, 40) : undefined;
    if (name === "" ) return Response.json({ error: "empty_name" }, { status: 400 });
    if (name === undefined && seed === undefined) return Response.json({ error: "nothing_to_change" }, { status: 400 });
    await db()`
      update people set name = coalesce(${name ?? null}, name), avatar_seed = coalesce(${seed ?? null}, avatar_seed)
      where id = ${me.id}`;
    return Response.json({ ...me, name: name ?? me.name, avatarSeed: seed ?? me.avatarSeed });
  } catch (e) {
    console.error("PATCH /api/me failed:", e instanceof Error ? e.message : e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
}
