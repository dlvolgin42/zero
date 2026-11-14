import { CURS } from "@/lib/model";
import { db } from "./db";

// Daily rates, units of each currency per 1 US dollar, from the free ExchangeRate-API open endpoint (updates once a day,
// covers every currency the app knows). There is no scheduler on the server, so the first request of a day fetches and
// stores them; later requests read the stored copy. If the source is down, the newest stored day is used.
const SOURCE = "https://open.er-api.com/v6/latest/USD";

export interface Rates { day: string; perUsd: Record<string, number> }

async function stored(day: string | null): Promise<Rates | null> {
  const sql = db();
  const d = day ?? (await sql<{ day: string }[]>`select to_char(max(day), 'YYYY-MM-DD') as day from exchange_rates`)[0]?.day;
  if (!d) return null;
  const rows = await sql<{ currency: string; per_usd: string }[]>`select currency, per_usd from exchange_rates where day = ${d}`;
  if (rows.length < CURS.length) return null;
  return { day: d, perUsd: Object.fromEntries(rows.map((r) => [r.currency.trim(), Number(r.per_usd)])) };
}

let inflight: Promise<Rates | null> | null = null;

async function fetchToday(day: string): Promise<Rates | null> {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`rates source answered ${res.status}`);
  const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (body.result !== "success" || !body.rates) throw new Error("rates source returned no rates");
  const perUsd: Record<string, number> = {};
  for (const c of CURS) {
    const v = body.rates[c];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) throw new Error(`no rate for ${c}`);
    perUsd[c] = v;
  }
  const sql = db();
  await sql.begin(async (tx) => {
    for (const c of CURS) {
      await tx`insert into exchange_rates (day, currency, per_usd) values (${day}, ${c}, ${perUsd[c]})
               on conflict (day, currency) do update set per_usd = excluded.per_usd, fetched_at = now()`;
    }
  });
  return { day, perUsd };
}

export async function currentRates(): Promise<Rates | null> {
  const day = new Date().toISOString().slice(0, 10);
  const today = await stored(day);
  if (today) return today;
  inflight ??= fetchToday(day)
    .catch((e) => { console.error("rates fetch failed:", e instanceof Error ? e.message : e); return null; })
    .finally(() => { inflight = null; });
  return (await inflight) ?? (await stored(null));
}
