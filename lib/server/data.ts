import { CURS, fmt, type Cur, type Expense, type LogEntry, type Netting, type Person } from "@/lib/model";
import { db } from "./db";
import { randomToken } from "./auth";

// Errors the API turns into a clean response instead of a crash.
export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
const isMoney = (n: unknown, min: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= min && n <= 1e13;
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const bad = (code: string) => new HttpError(400, code);

// The client calls the logged-in person "me" everywhere; real ids only travel for other people.
const real = (id: string, me: string) => (id === "me" ? me : id);
const alias = (id: string, me: string) => (id === me ? "me" : id);

export interface State {
  people: Person[];
  friendIds: string[];
  manualOrder: boolean;
  expenses: Expense[];
  nettings: Netting[];
}

// A snapshot of an expense, stored in the history so every change can be shown as "was -> became".
interface Snap {
  title: string; amount: number; currency: string; date: string; tag: string | null; source: string;
  payers: { personId: string; amount: number }[]; shares: { personId: string; amount: number }[];
}

function describe(action: string, before: Snap | null, after: Snap | null): string {
  if (action === "created") return after?.source === "voice" ? "внёс трату голосом" : "внёс трату";
  if (action === "deleted") return "удалил трату";
  if (action === "restored") return "восстановил трату";
  if (!before || !after) return "изменил";
  const parts: string[] = [];
  if (before.amount !== after.amount || before.currency !== after.currency)
    parts.push(`сумма ${fmt(before.amount, before.currency as Cur)} → ${fmt(after.amount, after.currency as Cur)}`);
  if (before.title !== after.title) parts.push(`название «${before.title}» → «${after.title}»`);
  if (JSON.stringify([before.payers, before.shares]) !== JSON.stringify([after.payers, after.shares])) parts.push("плательщик или доли");
  if (before.date !== after.date) parts.push("дата");
  if ((before.tag ?? "") !== (after.tag ?? "")) parts.push("тег");
  return `изменил: ${parts.join(", ") || "без изменений"}`;
}

// Everything this person may see: their friends, the expenses they take part in (with history) and their nettings.
export async function loadState(me: string): Promise<State> {
  const sql = db();
  const friends = await sql<{ id: string; position: number }[]>`
    select friend_id as id, position from friend_links where owner_id = ${me} order by position, created_at`;
  const exp = await sql<{ id: string; title: string; amount_minor: string; currency: string; spent_on: string; created_by: string; source: string; deleted: boolean; tag: string | null }[]>`
    select e.id, e.title, e.amount_minor, e.currency, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, e.created_by, e.source,
           (e.deleted_at is not null) as deleted, t.name as tag
    from expenses e left join tags t on t.id = e.tag_id
    where e.created_by = ${me}
       or exists (select 1 from expense_payers p where p.expense_id = e.id and p.person_id = ${me})
       or exists (select 1 from expense_shares s where s.expense_id = e.id and s.person_id = ${me})
    order by e.spent_on desc, e.created_at desc`;
  const ids = exp.map((r) => r.id);
  const payers = ids.length ? await sql<{ expense_id: string; person_id: string; amount_minor: string }[]>`
    select expense_id, person_id, amount_minor from expense_payers where expense_id = any(${ids}::uuid[])` : [];
  const shares = ids.length ? await sql<{ expense_id: string; person_id: string; amount_minor: string }[]>`
    select expense_id, person_id, amount_minor from expense_shares where expense_id = any(${ids}::uuid[])` : [];
  const events = ids.length ? await sql<{ expense_id: string; actor_id: string; action: string; before: Snap | null; after: Snap | null; at: string }[]>`
    select expense_id, actor_id, action, before, after, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from expense_events where expense_id = any(${ids}::uuid[]) order by at, id` : [];
  const nets = await sql<{ id: string; debtor_id: string; creditor_id: string; from_currency: string; from_minor: string; to_currency: string; to_minor: string; rate: string; made_on: string }[]>`
    select id, debtor_id, creditor_id, from_currency, from_minor, to_currency, to_minor, rate, to_char(made_on, 'YYYY-MM-DD') as made_on
    from nettings where debtor_id = ${me} or creditor_id = ${me} order by made_on, created_at`;

  const personIds = new Set<string>([me, ...friends.map((f) => f.id)]);
  for (const r of exp) personIds.add(r.created_by);
  for (const r of [...payers, ...shares]) personIds.add(r.person_id);
  for (const r of events) personIds.add(r.actor_id);
  for (const r of nets) { personIds.add(r.debtor_id); personIds.add(r.creditor_id); }
  const people = await sql<{ id: string; name: string; avatar_seed: string | null; has_account: boolean }[]>`
    select p.id, p.name, p.avatar_seed, exists (select 1 from identities i where i.person_id = p.id) as has_account
    from people p where p.id = any(${[...personIds]}::uuid[])`;
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const who = (id: string) => (id === me ? "Я" : nameOf.get(id) ?? "?");

  const expenses: Expense[] = exp.map((r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount_minor),
    currency: r.currency as Cur,
    date: r.spent_on,
    payers: payers.filter((p) => p.expense_id === r.id).map((p) => ({ personId: alias(p.person_id, me), amount: Number(p.amount_minor) })),
    shares: shares.filter((p) => p.expense_id === r.id).map((p) => ({ personId: alias(p.person_id, me), amount: Number(p.amount_minor) })),
    tag: r.tag ?? undefined,
    createdBy: alias(r.created_by, me),
    source: r.source === "voice" ? "voice" : "manual",
    deleted: r.deleted,
    log: events.filter((v) => v.expense_id === r.id).map<LogEntry>((v) => ({ who: who(v.actor_id), when: v.at, text: describe(v.action, v.before, v.after) })),
  }));

  return {
    people: people.map((p) => ({ id: alias(p.id, me), name: p.name, hasAccount: p.has_account, avatarSeed: p.avatar_seed ?? undefined })),
    friendIds: friends.map((f) => f.id),
    manualOrder: friends.some((f) => f.position !== 0),
    expenses,
    nettings: nets.map((n) => ({
      id: n.id, debtor: alias(n.debtor_id, me), creditor: alias(n.creditor_id, me),
      fromCur: n.from_currency as Cur, fromAmount: Number(n.from_minor), toCur: n.to_currency as Cur, toAmount: Number(n.to_minor),
      rate: Number(n.rate), date: n.made_on,
    })),
  };
}

// "Sasha without an account": a placeholder person, linked as a friend of whoever created it.
export async function createGhost(me: string, rawName: unknown): Promise<Person> {
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";
  if (!name) throw bad("empty_name");
  return db().begin(async (tx) => {
    const created = await tx<{ id: string }[]>`
      insert into people (name, avatar_seed, created_by) values (${name}, ${randomToken(6)}, ${me}) returning id`;
    const id = created[0].id;
    // Before the user has ever dragged the list, new friends keep the default order; after that they go to the end.
    const top = await tx<{ m: number | null }[]>`select max(position) as m from friend_links where owner_id = ${me}`;
    const position = (top[0]?.m ?? 0) > 0 ? (top[0].m as number) + 1 : 0;
    await tx`insert into friend_links (owner_id, friend_id, position) values (${me}, ${id}, ${position})`;
    const seed = await tx<{ avatar_seed: string }[]>`select avatar_seed from people where id = ${id}`;
    return { id, name, hasAccount: false, avatarSeed: seed[0].avatar_seed };
  });
}

export async function setFriendOrder(me: string, rawIds: unknown) {
  if (!Array.isArray(rawIds) || rawIds.length > 200 || !rawIds.every(isUuid)) throw bad("bad_ids");
  const ids = rawIds as string[];
  await db().begin(async (tx) => {
    const mine = (await tx<{ friend_id: string }[]>`select friend_id from friend_links where owner_id = ${me}`).map((r) => r.friend_id);
    const ordered = [...ids.filter((id) => mine.includes(id)), ...mine.filter((id) => !ids.includes(id))];
    for (let i = 0; i < ordered.length; i++)
      await tx`update friend_links set position = ${i + 1} where owner_id = ${me} and friend_id = ${ordered[i]}`;
  });
}

export interface ExpenseInput {
  id?: unknown; title?: unknown; amount?: unknown; currency?: unknown; date?: unknown;
  payers?: unknown; shares?: unknown; tag?: unknown; source?: unknown;
}

function parts(raw: unknown, me: string, total: number, what: string) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) throw bad(`bad_${what}`);
  const out: { personId: string; amount: number }[] = [];
  for (const p of raw as { personId?: unknown; amount?: unknown }[]) {
    const personId = typeof p?.personId === "string" ? real(p.personId, me) : "";
    if (!isUuid(personId) || !isMoney(p.amount, 0)) throw bad(`bad_${what}`);
    if (out.some((o) => o.personId === personId)) throw bad(`duplicate_${what}`);
    out.push({ personId, amount: p.amount as number });
  }
  if (out.reduce((a, b) => a + b.amount, 0) !== total) throw bad(`${what}_do_not_add_up`);
  return out;
}

// Create or change an expense. Whoever takes part may do it. History records who changed what.
export async function upsertExpense(me: string, id: string, input: ExpenseInput): Promise<void> {
  if (!isUuid(id)) throw bad("bad_id");
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const amount = input.amount;
  if (!isMoney(amount, 1)) throw bad("bad_amount");
  const currency = input.currency;
  if (typeof currency !== "string" || !(CURS as string[]).includes(currency)) throw bad("bad_currency");
  if (!isDay(input.date)) throw bad("bad_date");
  const day = input.date;
  const tag = typeof input.tag === "string" && input.tag.trim() ? input.tag.trim().slice(0, 40) : null;
  const source = input.source === "voice" ? "voice" : "manual";
  const payers = parts(input.payers, me, amount, "payers");
  const shares = parts(input.shares, me, amount, "shares");
  const people = [...new Set([...payers, ...shares].map((p) => p.personId))];
  if (!people.includes(me)) throw bad("not_a_participant");

  try {
    await db().begin(async (tx) => {
      const existing = await tx<{ created_by: string; deleted: boolean; title: string; amount_minor: string; currency: string; spent_on: string; tag: string | null; source: string }[]>`
        select e.created_by, (e.deleted_at is not null) as deleted, e.title, e.amount_minor, e.currency, to_char(e.spent_on, 'YYYY-MM-DD') as spent_on, t.name as tag, e.source
        from expenses e left join tags t on t.id = e.tag_id where e.id = ${id} for update of e`;
      const prev = existing[0];
      let before: Snap | null = null;
      const allowed = new Set<string>([me]);
      for (const r of await tx<{ friend_id: string }[]>`select friend_id from friend_links where owner_id = ${me}`) allowed.add(r.friend_id);
      if (prev) {
        const oldPayers = await tx<{ person_id: string; amount_minor: string }[]>`select person_id, amount_minor from expense_payers where expense_id = ${id} order by person_id`;
        const oldShares = await tx<{ person_id: string; amount_minor: string }[]>`select person_id, amount_minor from expense_shares where expense_id = ${id} order by person_id`;
        const mine = prev.created_by === me || oldPayers.some((p) => p.person_id === me) || oldShares.some((p) => p.person_id === me);
        if (!mine) throw new HttpError(404, "not_found");
        if (prev.deleted) throw new HttpError(409, "deleted");
        for (const p of [...oldPayers, ...oldShares]) allowed.add(p.person_id);
        before = {
          title: prev.title, amount: Number(prev.amount_minor), currency: prev.currency, date: prev.spent_on, tag: prev.tag, source: prev.source,
          payers: oldPayers.map((p) => ({ personId: p.person_id, amount: Number(p.amount_minor) })),
          shares: oldShares.map((p) => ({ personId: p.person_id, amount: Number(p.amount_minor) })),
        };
      }
      if (!people.every((p) => allowed.has(p))) throw new HttpError(403, "unknown_person");

      let tagId: string | null = null;
      if (tag) {
        const found = await tx<{ id: string }[]>`select id from tags where created_by = ${me} and lower(name) = lower(${tag})`;
        tagId = found[0]?.id ?? (await tx<{ id: string }[]>`insert into tags (name, created_by) values (${tag}, ${me}) returning id`)[0].id;
      }
      if (prev) {
        await tx`update expenses set title = ${title}, amount_minor = ${amount}, currency = ${currency}, spent_on = ${day}, tag_id = ${tagId} where id = ${id}`;
        await tx`delete from expense_payers where expense_id = ${id}`;
        await tx`delete from expense_shares where expense_id = ${id}`;
      } else {
        await tx`insert into expenses (id, title, amount_minor, currency, spent_on, tag_id, created_by, source)
                 values (${id}, ${title}, ${amount}, ${currency}, ${day}, ${tagId}, ${me}, ${prev ? before!.source : source})`;
      }
      for (const p of payers) await tx`insert into expense_payers (expense_id, person_id, amount_minor) values (${id}, ${p.personId}, ${p.amount})`;
      for (const p of shares) await tx`insert into expense_shares (expense_id, person_id, amount_minor) values (${id}, ${p.personId}, ${p.amount})`;
      const after: Snap = { title, amount, currency, date: day, tag, source: before?.source ?? source, payers, shares };
      await tx`insert into expense_events (expense_id, actor_id, action, before, after)
               values (${id}, ${me}, ${prev ? "updated" : "created"}, ${before ? JSON.stringify(before) : null}::jsonb, ${JSON.stringify(after)}::jsonb)`;
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = (e as { code?: string }).code;
    if (code === "23514") throw bad("amounts_do_not_add_up");
    if (code === "23503") throw bad("unknown_person");
    throw e;
  }
}

// Delete is soft: the expense leaves the balance but stays in the history and can be restored.
export async function setDeleted(me: string, id: string, deleted: boolean): Promise<void> {
  if (!isUuid(id)) throw bad("bad_id");
  await db().begin(async (tx) => {
    const rows = await tx<{ deleted: boolean }[]>`
      select (e.deleted_at is not null) as deleted from expenses e
      where e.id = ${id} and (e.created_by = ${me}
        or exists (select 1 from expense_payers p where p.expense_id = e.id and p.person_id = ${me})
        or exists (select 1 from expense_shares s where s.expense_id = e.id and s.person_id = ${me})) for update of e`;
    if (!rows[0]) throw new HttpError(404, "not_found");
    if (rows[0].deleted === deleted) return;
    await tx`update expenses set deleted_at = ${deleted ? new Date().toISOString() : null}::timestamptz where id = ${id}`;
    await tx`insert into expense_events (expense_id, actor_id, action) values (${id}, ${me}, ${deleted ? "deleted" : "restored"})`;
  });
}

export interface NettingInput {
  debtor?: unknown; creditor?: unknown; fromCur?: unknown; fromAmount?: unknown; toCur?: unknown; toAmount?: unknown; rate?: unknown; date?: unknown;
}

// Converting a debt between two people from one currency into another at the rate they agreed on.
export async function createNetting(me: string, input: NettingInput): Promise<void> {
  const debtor = typeof input.debtor === "string" ? real(input.debtor, me) : "";
  const creditor = typeof input.creditor === "string" ? real(input.creditor, me) : "";
  if (!isUuid(debtor) || !isUuid(creditor) || debtor === creditor || (debtor !== me && creditor !== me)) throw bad("bad_people");
  const known = (c: unknown): c is string => typeof c === "string" && (CURS as string[]).includes(c);
  if (!known(input.fromCur) || !known(input.toCur) || input.fromCur === input.toCur) throw bad("bad_currency");
  if (!isMoney(input.fromAmount, 1) || !isMoney(input.toAmount, 1)) throw bad("bad_amount");
  const rate = input.rate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw bad("bad_rate");
  if (!isDay(input.date)) throw bad("bad_date");
  const other = debtor === me ? creditor : debtor;
  const friend = await db()`select 1 from friend_links where owner_id = ${me} and friend_id = ${other}`;
  if (friend.length === 0) throw new HttpError(403, "unknown_person");
  await db()`
    insert into nettings (debtor_id, creditor_id, from_currency, from_minor, to_currency, to_minor, rate, made_on, created_by)
    values (${debtor}, ${creditor}, ${input.fromCur}, ${input.fromAmount}, ${input.toCur}, ${input.toAmount}, ${rate}, ${input.date}, ${me})`;
}

export const INVITE_COOKIE = "zero_invite";

// An invite link code. Without a ghost it is my personal link: one reusable code per person, created on first use.
// With a ghost (a placeholder person I made, "Sasha") it is a one-time link that hands that placeholder to whoever opens it.
export async function myInviteCode(me: string, ghostId?: string | null): Promise<{ code: string }> {
  const sql = db();
  if (ghostId) {
    if (!isUuid(ghostId)) throw bad("bad_id");
    const ok = await sql<{ id: string }[]>`
      select p.id from people p join friend_links f on f.friend_id = p.id and f.owner_id = ${me}
      where p.id = ${ghostId} and p.created_by = ${me} and p.merged_into is null
        and not exists (select 1 from identities i where i.person_id = p.id)`;
    if (!ok[0]) throw new HttpError(404, "no_such_placeholder");
    const found = await sql<{ code: string }[]>`
      select code from invites where inviter_id = ${me} and ghost_id = ${ghostId} and used_by is null order by created_at limit 1`;
    if (found[0]) return { code: found[0].code };
    const code = randomToken(9);
    await sql`insert into invites (code, inviter_id, ghost_id) values (${code}, ${me}, ${ghostId})`;
    return { code };
  }
  const found = await sql<{ code: string }[]>`
    select code from invites where inviter_id = ${me} and ghost_id is null and used_by is null order by created_at limit 1`;
  if (found[0]) return { code: found[0].code };
  const code = randomToken(9);
  await sql`insert into invites (code, inviter_id) values (${code}, ${me})`;
  return { code };
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["begin"]>[1]>[0];

// Hand a placeholder person over to a real one: every expense, share, friend link and history entry that pointed at
// the placeholder now points at the real person, and the placeholder is marked as merged. Money stays exactly the same.
async function mergePlaceholder(tx: Tx, ghost: string, into: string) {
  // Someone who was on the same expense twice (as the placeholder and as themselves) becomes one line with the sum.
  for (const table of ["expense_payers", "expense_shares"] as const) {
    await tx`
      insert into ${tx(table)} (expense_id, person_id, amount_minor)
      select expense_id, ${into}, amount_minor from ${tx(table)} where person_id = ${ghost}
      on conflict (expense_id, person_id) do update set amount_minor = ${tx(table)}.amount_minor + excluded.amount_minor`;
    await tx`delete from ${tx(table)} where person_id = ${ghost}`;
  }
  await tx`update expenses set created_by = ${into} where created_by = ${ghost}`;
  await tx`update expense_events set actor_id = ${into} where actor_id = ${ghost}`;
  await tx`update nettings set debtor_id = ${into} where debtor_id = ${ghost}`;
  await tx`update nettings set creditor_id = ${into} where creditor_id = ${ghost}`;
  await tx`update nettings set created_by = ${into} where created_by = ${ghost}`;
  await tx`
    insert into friend_links (owner_id, friend_id, position)
    select owner_id, ${into}, position from friend_links where friend_id = ${ghost} and owner_id <> ${into}
    on conflict do nothing`;
  await tx`delete from friend_links where friend_id = ${ghost} or owner_id = ${ghost}`;
  await tx`update people set merged_into = ${into} where id = ${ghost}`;
}

// Someone opened an invite link and is logged in. Makes both people friends; with a placeholder link they also take over
// the placeholder's expenses. Safe to repeat: a used placeholder link does nothing the second time.
export async function acceptInvite(code: string, me: string): Promise<void> {
  const sql = db();
  const rows = await sql<{ inviter_id: string; ghost_id: string | null; used_by: string | null }[]>`
    select inviter_id, ghost_id, used_by from invites where code = ${code} and (expires_at is null or expires_at > now())`;
  const inv = rows[0];
  if (!inv || inv.inviter_id === me) return;
  await sql.begin(async (tx) => {
    if (inv.ghost_id) {
      if (inv.used_by) return; // a placeholder can be handed over only once
      const ghost = await tx<{ id: string }[]>`
        select p.id from people p
        where p.id = ${inv.ghost_id} and p.merged_into is null and p.created_by = ${inv.inviter_id}
          and not exists (select 1 from identities i where i.person_id = p.id)
        for update`;
      if (ghost[0]) await mergePlaceholder(tx, ghost[0].id, me);
      await tx`update invites set used_by = ${me}, used_at = now() where code = ${code}`;
    } else {
      await tx`update invites set used_at = coalesce(used_at, now()) where code = ${code}`;
    }
    await tx`insert into friend_links (owner_id, friend_id) values (${me}, ${inv.inviter_id}), (${inv.inviter_id}, ${me}) on conflict do nothing`;
  });
}
