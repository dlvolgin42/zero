import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "./db";

export const SESSION_COOKIE = "zero_session";
export const SESSION_DAYS = 60;
export const isProd = process.env.NODE_ENV === "production";

// Public address of the app. Behind the owner's proxy the Host header is not reliable, so it comes from the environment.
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export interface Profile {
  id: string;
  name: string;
  avatarSeed: string | null;
  username: string | null;
}

// The browser only ever holds a random token; the database holds its hash.
export async function createSession(personId: string, userAgent: string | null) {
  const token = randomToken();
  await db()`
    insert into sessions (token_hash, person_id, expires_at, user_agent)
    values (${sha256(token)}, ${personId}, now() + ${SESSION_DAYS + " days"}::interval, ${userAgent?.slice(0, 300) ?? null})`;
  return token;
}

export async function destroySession(token: string) {
  await db()`delete from sessions where token_hash = ${sha256(token)}`;
}

// Who is logged in, or null. Touches last_seen_at at most every five minutes.
export async function currentProfile(token: string | undefined): Promise<Profile | null> {
  if (!token) return null;
  const sql = db();
  const rows = await sql<{ id: string; name: string; avatar_seed: string | null; username: string | null }[]>`
    select p.id, p.name, p.avatar_seed,
           (select i.username from identities i where i.person_id = p.id and i.provider = 'telegram' limit 1) as username
    from sessions s join people p on p.id = s.person_id
    where s.token_hash = ${sha256(token)} and s.expires_at > now()`;
  const r = rows[0];
  if (!r) return null;
  await sql`update sessions set last_seen_at = now() where token_hash = ${sha256(token)} and last_seen_at < now() - interval '5 minutes'`;
  return { id: r.id, name: r.name, avatarSeed: r.avatar_seed, username: r.username };
}

// Mutating requests must come from our own pages (on top of SameSite=Lax cookies).
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === appUrl();
}

export interface TelegramClaims {
  id: string;
  name: string | null;
  username: string | null;
}

// Find the person behind a Telegram account, or create a new one on first login.
// A person that was merged into another account resolves to the account.
export async function personForTelegram(c: TelegramClaims): Promise<string> {
  return db().begin(async (tx) => {
    const found = await tx<{ person_id: string }[]>`
      select person_id from identities where provider = 'telegram' and provider_user_id = ${c.id}`;
    let personId = found[0]?.person_id;
    if (personId) {
      await tx`update identities set username = ${c.username} where provider = 'telegram' and provider_user_id = ${c.id}`;
      const merged = await tx<{ id: string }[]>`
        with recursive r as (
          select id, merged_into from people where id = ${personId}
          union all
          select p.id, p.merged_into from people p join r on p.id = r.merged_into)
        select id from r where merged_into is null limit 1`;
      return merged[0]?.id ?? personId;
    }
    const name = (c.name ?? "").trim().slice(0, 60) || (c.username ?? "").slice(0, 60) || "Без имени";
    const created = await tx<{ id: string }[]>`
      insert into people (name, avatar_seed) values (${name}, ${randomToken(6)}) returning id`;
    personId = created[0].id;
    await tx`
      insert into identities (person_id, provider, provider_user_id, username)
      values (${personId}, 'telegram', ${c.id}, ${c.username})`;
    return personId;
  });
}
