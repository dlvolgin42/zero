import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, appUrl, createSession, isProd, personForTelegram } from "@/lib/server/auth";

const ISSUER = "https://oauth.telegram.org";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

// Step 2: Telegram sends the browser back here with a one-time code. We swap it for a signed ID token on the server
// (the client secret never reaches the browser), check the token, then start our own session.
export async function GET(request: NextRequest) {
  // Read everything from the request first, outside try/catch: Next uses a thrown signal to mark this route as request-time.
  const params = request.nextUrl.searchParams;
  const code = params.get("code"), state = params.get("state");
  const savedRaw = request.cookies.get("tg_oauth")?.value;
  const userAgent = request.headers.get("user-agent");

  const back = (ok: boolean) => {
    const res = NextResponse.redirect(`${appUrl()}/${ok ? "" : "?login=failed"}`);
    res.cookies.delete({ name: "tg_oauth", path: "/api/auth/telegram" });
    return res;
  };
  try {
    const clientId = process.env.TELEGRAM_CLIENT_ID, secret = process.env.TELEGRAM_CLIENT_SECRET;
    const saved = JSON.parse(savedRaw ?? "null") as { state: string; verifier: string } | null;
    if (!clientId || !secret || !code || !state || !saved || saved.state !== state) return back(false);

    const tokenRes = await fetch(`${ISSUER}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, client_id: clientId,
        redirect_uri: `${appUrl()}/api/auth/telegram/callback`, code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) { console.error("telegram token exchange failed:", tokenRes.status); return back(false); }
    const { id_token } = (await tokenRes.json()) as { id_token?: string };
    if (!id_token) return back(false);

    const { payload } = await jwtVerify(id_token, jwks, { issuer: ISSUER, audience: clientId });
    const telegramId = String(payload.id ?? payload.sub ?? "");
    if (!telegramId) return back(false);

    const personId = await personForTelegram({
      id: telegramId,
      name: typeof payload.name === "string" ? payload.name : null,
      username: typeof payload.preferred_username === "string" ? payload.preferred_username : null,
    });
    const token = await createSession(personId, userAgent);

    const res = back(true);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
    return res;
  } catch (e) {
    console.error("telegram login failed:", e instanceof Error ? e.message : e);
    return back(false);
  }
}
