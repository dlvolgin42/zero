import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { SAVED_COOKIE, SESSION_COOKIE, SESSION_DAYS, appUrl, currentProfile, isProd } from "@/lib/server/auth";
import { INVITE_COOKIE, acceptInvite } from "@/lib/server/data";
import { hasDatabase } from "@/lib/server/db";

// Step 1 of "Log in with Telegram" (OpenID Connect with PKCE): send the browser to Telegram.
// A one-time state and a PKCE verifier are kept in a short-lived cookie that only the callback route can see.
// If this browser logged out earlier, the old session is still remembered: one tap brings it back without Telegram.
export async function GET(request: NextRequest) {
  const saved = request.cookies.get(SAVED_COOKIE)?.value;
  if (saved && hasDatabase()) {
    try {
      const profile = await currentProfile(saved);
      if (profile) {
        const invite = request.cookies.get(INVITE_COOKIE)?.value;
        if (invite) { await acceptInvite(invite, profile.id).catch(() => {}); }
        const back = NextResponse.redirect(`${appUrl()}/`);
        back.cookies.set(SESSION_COOKIE, saved, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
        back.cookies.delete({ name: SAVED_COOKIE, path: "/api/auth/telegram" });
        back.cookies.delete({ name: INVITE_COOKIE, path: "/" });
        return back;
      }
    } catch (e) { console.error("resume saved session failed:", e instanceof Error ? e.message : e); }
  }
  const clientId = process.env.TELEGRAM_CLIENT_ID;
  if (!clientId) return Response.json({ error: "telegram_not_configured" }, { status: 503 });

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  const url = new URL("https://oauth.telegram.org/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl()}/api/auth/telegram/callback`,
    response_type: "code",
    scope: "openid profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set("tg_oauth", JSON.stringify({ state, verifier }), {
    httpOnly: true, secure: isProd, sameSite: "lax", path: "/api/auth/telegram", maxAge: 600,
  });
  return res;
}
