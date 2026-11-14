import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, appUrl, currentProfile, isProd } from "@/lib/server/auth";
import { INVITE_COOKIE, acceptInvite } from "@/lib/server/data";
import { hasDatabase } from "@/lib/server/db";

// Opened from an invite link or QR. Logged in: connect right away. Not logged in: remember the code, the login finishes the job.
export async function GET(request: NextRequest, ctx: RouteContext<"/join/[code]">) {
  const { code } = await ctx.params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const res = NextResponse.redirect(`${appUrl()}/`);
  if (!hasDatabase() || !/^[\w-]{6,40}$/.test(code)) return res;
  try {
    const me = await currentProfile(token);
    if (me) await acceptInvite(code, me.id);
    else res.cookies.set(INVITE_COOKIE, code, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 3600 });
  } catch (e) { console.error("join failed:", e instanceof Error ? e.message : e); }
  return res;
}
