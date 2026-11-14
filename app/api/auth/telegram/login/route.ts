import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appUrl, isProd } from "@/lib/server/auth";

// Step 1 of "Log in with Telegram" (OpenID Connect with PKCE): send the browser to Telegram.
// A one-time state and a PKCE verifier are kept in a short-lived cookie that only the callback route can see.
export async function GET() {
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
