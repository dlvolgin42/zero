import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, appUrl, currentProfile, isProd } from "@/lib/server/auth";
import { INVITE_COOKIE, acceptInvite } from "@/lib/server/data";
import { hasDatabase } from "@/lib/server/db";

// Opened from an invite link or QR. Logged in: connect right away. Not logged in: remember the code, the login finishes the job.
export async function GET(request: NextRequest, ctx: RouteContext<"/join/[code]">) {
  const { code } = await ctx.params;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Not logged in: the code also rides along in the address, so the login keeps it even if the cookie does not survive
  // (for example when the link was opened in another browser than the one that finishes the login).
  const res = NextResponse.redirect(`${appUrl()}/`);
  if (!hasDatabase() || !/^[\w-]{6,40}$/.test(code)) return res;
  try {
    const me = await currentProfile(token);
    if (me) await acceptInvite(code, me.id);
    else { res.headers.set("location", `${appUrl()}/?invite=${code}`); res.cookies.set(INVITE_COOKIE, code, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 3600 }); }
  } catch (e) { console.error("join failed:", e instanceof Error ? e.message : e); }
  return res;
}
