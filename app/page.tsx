"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Pencil, Send, Shuffle, ChevronDown, ChevronRight, Copy, Delete, Hash, Mic, Search, Plus, UserPlus, X } from "lucide-react";
import {
  Actions, ActionsButton, ActionsGroup, ActionsLabel, App, Block, BlockTitle, Button, Chip, Link, List, ListInput, ListItem,
  Navbar, NavbarBackLink, Page, Segmented, SegmentedButton,
} from "konsta/react";
import { ME, demoExpenses, demoPeople } from "@/lib/demo";
import {
  CURS, CUR_INFO, Cur, CurMap, Expense, Netting, Person, SYMBOL,
  balancesFor, fmt, involves, nonZero, num, pairDebts, rate, splitEqual,
} from "@/lib/model";
import { Draft, parsePhrase } from "@/lib/parse";
import { avatarUri } from "@/lib/avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { PillSegmented } from "@/components/PillSegmented";
import { VoiceControl } from "@/components/VoiceControl";

type Screen =
  | { s: "login" }
  | { s: "home" }
  | { s: "friend"; id: string }
  | { s: "expense"; id: string }
  | { s: "net"; id: string }
  | { s: "history" }
  | { s: "settings" };

type ThemePref = "auto" | "ios" | "material";
const THEME_KEY = "theme-pref";

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);
const ruDate = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
const detectTheme = (): "ios" | "material" => (/android/i.test(navigator.userAgent) ? "material" : "ios");

const muted = "text-sm opacity-55";
const pos = "text-[#0E9F6E]";
const neg = "text-[#E0245E]";
// Brand: near-black ink on a light neutral base; lavender appears only in the logo and the plus icon.
const INK = "text-[#111827]";
const selectedChip = {
  fillBgIos: "bg-[#111827]", fillTextIos: "text-white",
  fillBgMaterial: "bg-[#111827]", fillTextMaterial: "text-white",
};
const mainBtn = {
  fillBgIos: "bg-[#111827] active:bg-black", fillBgMaterial: "bg-[#111827]",
  fillTextIos: "text-white", fillTextMaterial: "text-white",
};
const tonalBtn = {
  tonalBgIos: "bg-black/5 active:bg-black/10", tonalBgMaterial: "bg-black/5",
  tonalTextIos: INK, tonalTextMaterial: INK,
};
const clearBtn = { textIos: INK, textMaterial: INK };
const inkLink = { textIos: INK, textMaterial: INK, navbarTextIos: INK, navbarTextMaterial: INK };

type InputEv = React.ChangeEvent<HTMLInputElement>;

function Money({ v, cur }: { v: number; cur: Cur }) {
  return <span className={v > 0 ? pos : neg}>{v > 0 ? "+" : "−"}{fmt(v, cur)}</span>;
}

// Numbers that count from the old value to the new one, so a change is visible instead of just replacing the figure.
function useCountUp(target: number, initial: number = target, ms = 800) {
  const [shown, setShown] = useState(initial);
  const current = useRef(initial);
  useEffect(() => {
    if (target === current.current) return;
    const from = current.current, start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // Whole units while counting, so cents do not flicker; the exact value lands at the end.
      const v = t < 1 ? Math.round((from + (target - from) * (1 - Math.pow(1 - t, 3))) / 100) * 100 : target;
      current.current = v; setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

// `from` is only used when the figure first appears together with a change (e.g. a brand-new currency starts from 0).
function AnimatedMoney({ v, cur, from }: { v: number; cur: Cur; from?: number }) {
  const shown = useCountUp(v, from ?? v);
  return <span className={v > 0 ? pos : neg}>{v > 0 ? "+" : "−"}{fmt(Math.abs(shown), cur)}</span>;
}

function AnimatedNum({ v }: { v: number }) {
  return <>{num(useCountUp(v))}</>;
}

// A "+500 ₽" chip that pops up beside a balance and floats away, showing what the last expense added.
function DeltaBadge({ ch }: { ch?: CurMap }) {
  const items = nonZero(ch);
  if (items.length === 0) return null;
  return (
    <span className="delta-float pointer-events-none absolute top-[28%] right-full z-10 mr-1 flex flex-col items-end gap-0.5">
      {items.map(([c, d]) => (
        <span key={c} className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white shadow-md ${d > 0 ? "bg-[#0E9F6E]" : "bg-[#E0245E]"}`}>{d > 0 ? "+" : "−"}{fmt(d, c)}</span>
      ))}
    </span>
  );
}

function Face({ person, className = "size-10" }: { person: Person; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={avatarUri(person.avatarSeed ?? person.id)} alt="" draggable={false} className={`${className} shrink-0 rounded-full bg-black/5 object-cover`} />;
}

function BalanceLines({ m, ch }: { m: CurMap | undefined; ch?: CurMap }) {
  const items = nonZero(m);
  if (items.length === 0) return <span className="opacity-55">в расчёте</span>;
  return <div className="text-right">{items.map(([c, v]) => <div key={c}><AnimatedMoney v={v} cur={c} from={ch?.[c] ? v - ch[c]! : undefined} /></div>)}</div>;
}

function Chips<T extends string>({ options, selected, onPick, extra }: {
  options: { value: T; label: string }[]; selected: T[]; onPick: (v: T) => void; extra?: React.ReactNode;
}) {
  return (
    <Block className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} outline={!selected.includes(o.value)} colors={selectedChip}
          className="!h-10 cursor-pointer !px-4 !text-base" onClick={() => onPick(o.value)}>{o.label}</Chip>
      ))}
      {extra}
    </Block>
  );
}

// All currencies on one line, so every friend row has the same height.
function BalanceInline({ m, ch }: { m: CurMap | undefined; ch?: CurMap }) {
  const items = nonZero(m);
  if (items.length === 0) return <span className="opacity-55">в расчёте</span>;
  return <span className="flex gap-x-3 overflow-hidden whitespace-nowrap">{items.map(([c, v]) => <AnimatedMoney key={c} v={v} cur={c} from={ch?.[c] ? v - ch[c]! : undefined} />)}</span>;
}

// My net result in one expense, optionally only against one person.
function myNet(e: Expense, other?: string): number {
  let v = 0;
  for (const d of pairDebts(e)) {
    if (d.to === ME && (!other || d.from === other)) v += d.amount;
    if (d.from === ME && (!other || d.to === other)) v -= d.amount;
  }
  return v;
}

export default function Root() {
  const [stack, setStack] = useState<Screen[]>([{ s: "login" }]);
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [expenses, setExpenses] = useState<Expense[]>(demoExpenses);
  const [nettings, setNettings] = useState<Netting[]>([]);
  const [lastCur, setLastCur] = useState<Cur>("RUB");
  const [addOpen, setAddOpen] = useState(false);
  // Called with the new person's id when "add person" was opened from the expense form.
  const [addCb, setAddCb] = useState<((id: string) => void) | null>(null);
  // The expense form lives in a bottom sheet over the current screen.
  const [form, setForm] = useState<{ editId?: string; draft?: Draft; source: "manual" | "voice"; key: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const openForm = (f: { editId?: string; draft?: Draft; source: "manual" | "voice" }) => {
    setForm({ ...f, key: Date.now() });
    setFormOpen(true);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [recActive, setRecActive] = useState(false);
  const [profileName, setProfileName] = useState("Дмитрий");
  // "loading": asking the server who we are; "anon": not logged in; "user": logged in with Telegram;
  // "demo": the server has no database (local development), so the old demo login is offered.
  const [auth, setAuth] = useState<"loading" | "anon" | "user" | "demo">("loading");
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [friendOrder, setFriendOrder] = useState<string[]>([]);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarSeeds, setAvatarSeeds] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string, action?: { label: string; run: () => void }) => {
    setToast({ text, action });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 3500);
  };
  const [pref, setPref] = useState<ThemePref>("auto");
  const [detected, setDetected] = useState<"ios" | "material">("ios");

  // Device look: Android gets Material, everything else iOS; a manual choice wins.
  useEffect(() => {
    setDetected(detectTheme());
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "ios" || saved === "material") setPref(saved);
    } catch {}
  }, []);
  // Profile (name and avatar) is kept on this device until the real account exists.
  useEffect(() => {
    try {
      const n = localStorage.getItem("profile-name");
      if (n) setProfileName(n);
      const a = localStorage.getItem("avatar-seed");
      if (a) setPeople((ps) => ps.map((x) => (x.id === ME ? { ...x, avatarSeed: a } : x)));
    } catch {}
  }, []);
  // Manual friend order, kept on this device (it moves to the database with the real account).
  useEffect(() => {
    try { const o = JSON.parse(localStorage.getItem("friend-order") ?? "[]"); if (Array.isArray(o)) setFriendOrder(o.filter((x) => typeof x === "string")); } catch {}
  }, []);
  // Who is logged in? The cookie is HttpOnly, so only the server can tell.
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/me");
        if (off) return;
        if (r.ok) {
          const me = (await r.json()) as { name: string; avatarSeed: string | null };
          setProfileName(me.name);
          if (me.avatarSeed) setPeople((ps) => ps.map((x) => (x.id === ME ? { ...x, avatarSeed: me.avatarSeed! } : x)));
          setAuth("user");
          setStack([{ s: "home" }]);
        } else setAuth(r.status === 503 ? "demo" : "anon");
      } catch { if (!off) setAuth("anon"); }
    })();
    if (new URLSearchParams(location.search).get("login") === "failed") {
      history.replaceState(null, "", location.pathname);
      notify("Не удалось войти через Telegram. Попробуй ещё раз");
    }
    return () => { off = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reorderFriends = (ids: string[]) => { setFriendOrder(ids); try { localStorage.setItem("friend-order", JSON.stringify(ids)); } catch {} };
  const patchMe = (body: { name?: string; avatarSeed?: string }) =>
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
  const rename = (n: string) => {
    setProfileName(n);
    if (auth === "user") {
      if (nameTimer.current) clearTimeout(nameTimer.current);
      if (n.trim()) nameTimer.current = setTimeout(() => void patchMe({ name: n }), 600);
    } else { try { localStorage.setItem("profile-name", n); } catch {} }
  };
  const pickAvatar = (seed: string) => {
    setPeople((ps) => ps.map((x) => (x.id === ME ? { ...x, avatarSeed: seed } : x)));
    if (auth === "user") void patchMe({ avatarSeed: seed });
    else { try { localStorage.setItem("avatar-seed", seed); } catch {} }
    setAvatarOpen(false);
  };
  const logout = async () => {
    if (auth === "user") { try { await fetch("/api/auth/logout", { method: "POST" }); } catch {} setAuth("anon"); }
    depth.current = 0;
    setStack([{ s: "login" }]);
  };
  const freshSeeds = (keep: string) => [keep, ...Array.from({ length: 11 }, () => Math.random().toString(36).slice(2, 10))];
  const openAvatarPicker = () => { setAvatarSeeds(freshSeeds(people.find((x) => x.id === ME)?.avatarSeed ?? ME)); setAvatarOpen(true); };
  const choosePref = (p: ThemePref) => {
    setPref(p);
    try { localStorage.setItem(THEME_KEY, p); } catch {}
  };
  const theme = pref === "auto" ? detected : pref;

  const screen = stack[stack.length - 1];
  // Screens are mirrored in the browser history, so the Android back button/gesture and Safari's back swipe go to the
  // previous screen instead of leaving the app. `depth` counts the history entries we pushed.
  const depth = useRef(0);
  const go = (s: Screen) => {
    setStack((st) => [...st, s]);
    try { history.pushState({ z: 1 }, ""); depth.current++; } catch {}
  };
  const back = () => {
    if (depth.current > 0) history.back();
    else setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  };
  useEffect(() => {
    const onPop = () => { if (depth.current > 0) depth.current--; setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Swipe right anywhere = back (installed iOS apps have no system back gesture).
  const swipe = useRef({ canBack: false, back });
  swipe.current = { canBack: stack.length > 1 && !formOpen && !addOpen && !menuOpen && !avatarOpen, back };
  useEffect(() => {
    let sx = 0, sy = 0, tracking = false, fired = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; fired = false;
      tracking = e.touches.length === 1 && !(e.target as HTMLElement).closest("input, select, textarea, [data-no-swipe]");
    };
    const move = (e: TouchEvent) => {
      if (!tracking || fired) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (dx > 80 && Math.abs(dy) < dx * 0.5) {
        fired = true;
        if (swipe.current.canBack && !document.documentElement.classList.contains("sheet-open")) swipe.current.back();
      }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); };
  }, []);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "?";
  const balances = useMemo(() => balancesFor(ME, expenses, nettings), [expenses, nettings]);
  // What just changed per friend and currency; shown for a few seconds as a floating chip, a row flash and a count-up.
  const prevBalances = useRef(balances);
  const [changes, setChanges] = useState<Record<string, CurMap>>({});
  const changesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const diff: Record<string, CurMap> = {};
    for (const id of new Set([...Object.keys(prevBalances.current), ...Object.keys(balances)]))
      for (const c of CURS) {
        const d = (balances[id]?.[c] ?? 0) - (prevBalances.current[id]?.[c] ?? 0);
        if (d !== 0) (diff[id] ??= {})[c] = d;
      }
    prevBalances.current = balances;
    if (Object.keys(diff).length === 0) return;
    setChanges(diff);
    if (changesTimer.current) clearTimeout(changesTimer.current);
    changesTimer.current = setTimeout(() => setChanges({}), 3300);
  }, [balances]);
  const tags = [...new Set(expenses.map((e) => e.tag).filter(Boolean))] as string[];

  const addPerson = (n: string) => {
    const id = uid();
    setPeople((ps) => [...ps, { id, name: n, hasAccount: false }]);
    return id;
  };

  // Currency of the most recent expense shared with this person.
  const lastCurWith = (id: string): Cur | undefined =>
    expenses.filter((e) => !e.deleted && involves(e, ME) && involves(e, id)).sort((a, b) => b.date.localeCompare(a.date))[0]?.currency;

  // Dictated phrase -> expense. If the phrase has an amount and someone to split with, it is saved at once
  // (with a way to edit it); otherwise the form opens pre-filled with whatever was understood.
  const recordFromVoice = (text: string) => {
    const d = parsePhrase(text, people, ME, lastCur);
    if (d.amount > 0 && d.participantIds.some((id) => id !== d.payerId)) {
      const e: Expense = {
        id: uid(), title: d.title, amount: d.amount, currency: d.currency, date: today(),
        payers: [{ personId: d.payerId, amount: d.amount }],
        shares: splitEqual(d.amount, d.participantIds, d.payerId),
        createdBy: ME, source: "voice", deleted: false,
        log: [{ who: "Я", when: today(), text: "внёс трату голосом" }],
      };
      saveExpense(e);
      notify(`Записано: ${e.title} · ${fmt(e.amount, e.currency)}`, { label: "Изменить", run: () => { setToast(null); openForm({ editId: e.id, source: "voice" }); } });
    } else {
      openForm({ draft: d, source: "voice" });
    }
  };

  const saveExpense = (e: Expense) => {
    setExpenses((list) => (list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [e, ...list]));
    setLastCur(e.currency);
  };

  const page = (title: string, body: React.ReactNode, right?: React.ReactNode) => (
    <Page className="pb-40">
      <Navbar title={title} left={screen.s !== "home" ? <NavbarBackLink text="Назад" onClick={back} /> : undefined} right={right} />
      {body}
    </Page>
  );

  // Bottom glass bar: add friend, new expense, account menu. The voice button floats above it and takes the bar's place while recording.
  const me = people.find((x) => x.id === ME)!;
  const bar = (draft?: Draft) => (
    <>
      <VoiceControl onActive={setRecActive} onMessage={notify}
        onText={recordFromVoice} />
      <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))] transition duration-200 ${recActive ? "translate-y-6 opacity-0" : ""}`}>
        <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-full p-2">
          <button aria-label="Добавить друга" className="grid size-16 place-items-center rounded-full active:bg-black/10" onClick={() => { setAddCb(null); setAddOpen(true); }}><UserPlus className="size-7" /></button>
          <button aria-label="Новая трата" onClick={() => openForm({ source: "manual", draft })}
            className="grid size-[4.5rem] place-items-center rounded-full bg-[#a5b4fc] text-[#111827] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.85),inset_0_-4px_8px_rgba(79,70,229,0.3),0_6px_16px_rgba(99,102,241,0.42)] transition active:scale-95"><Plus className="size-8" /></button>
          <button aria-label="Аккаунт" className="grid size-16 place-items-center rounded-full active:bg-black/10" onClick={() => setMenuOpen(true)}><Face person={me} className="size-11" /></button>
        </div>
      </div>
    </>
  );

  const expenseItem = (e: Expense, other?: string) => {
    const v = myNet(e, other);
    return (
      <ListItem
        key={e.id} link chevron={false} onClick={() => go({ s: "expense", id: e.id })}
        title={<span className={e.deleted ? "line-through opacity-55" : ""}>{e.title}</span>}
        subtitle={`${ruDate(e.date)} · ${fmt(e.amount, e.currency)} · платил ${e.payers.map((p) => name(p.personId)).join(", ")}`}
        text={[e.tag && `#${e.tag}`, e.source === "voice" && "голосом"].filter(Boolean).join(" · ") || undefined}
        after={e.deleted ? "удалена" : v !== 0 ? <Money v={v} cur={e.currency} /> : "—"}
      />
    );
  };

  let content: React.ReactNode;

  if (screen.s === "login") {
    content = (
      <Page className="flex flex-col justify-center text-center">
        <h1 className="flex justify-center"><Logo className="text-5xl" /></h1>
        <p className={`${muted} mt-2`}>Общие траты с друзьями: кто кому сколько должен</p>
        <Block className="min-h-[5.5rem]">
          {auth === "anon" && <Button large colors={mainBtn} onClick={() => location.assign("/api/auth/telegram/login")}>Войти через Telegram</Button>}
          {auth === "demo" && (
            <>
              <Button large colors={mainBtn} onClick={() => setStack([{ s: "home" }])}>Войти в демо</Button>
              <p className={`${muted} mt-2`}>Здесь нет базы данных, поэтому вход через Telegram недоступен</p>
            </>
          )}
        </Block>
      </Page>
    );
  } else if (screen.s === "home") {
    const owed: CurMap = {}, owe: CurMap = {};
    for (const m of Object.values(balances))
      for (const [c, v] of nonZero(m)) {
        if (v > 0) owed[c] = (owed[c] ?? 0) + v; else owe[c] = (owe[c] ?? 0) - v;
      }
    const totals = (m: CurMap, cls: string) =>
      nonZero(m).length === 0
        ? <div className="text-xl font-semibold opacity-40">0</div>
        : (
          <div className={`grid grid-cols-[auto_1fr] gap-x-2 text-xl font-semibold tabular-nums ${cls}`}>
            {nonZero(m).map(([c, v]) => <Fragment key={c}><span>{SYMBOL[c]}</span><span><AnimatedNum v={v} /></span></Fragment>)}
          </div>
        );
    const friends = people.filter((p) => p.id !== ME);
    const hasDebt = (p: Person) => nonZero(balances[p.id]).length > 0;
    // Default: friends with a balance first. Once the user has dragged rows, their order wins; new friends go to the end.
    const byDebt = [...friends.filter(hasDebt), ...friends.filter((p) => !hasDebt(p))];
    const sorted = friendOrder.length
      ? [...(friendOrder.map((id) => friends.find((f) => f.id === id)).filter(Boolean) as Person[]), ...byDebt.filter((f) => !friendOrder.includes(f.id))]
      : byDebt;
    content = (
      <Page className="pb-44">
        <div className="flex h-14 items-center justify-center px-4 pt-safe"><Logo className="text-2xl" /></div>
        {/* Two separate cards, each with its title above it rather than inside. */}
        <div className="mt-2 grid grid-cols-2 gap-3 px-4">
          <div className="flex flex-col">
            <div className="mb-1.5 px-1 text-sm opacity-55">Тебе должны</div>
            <div className="min-h-[4.5rem] flex-1 rounded-2xl bg-white p-4">{totals(owed, pos)}</div>
          </div>
          <div className="flex flex-col">
            <div className="mb-1.5 px-1 text-sm opacity-55">Ты должен</div>
            <div className="min-h-[4.5rem] flex-1 rounded-2xl bg-white p-4">{totals(owe, neg)}</div>
          </div>
        </div>
        <BlockTitle>Друзья</BlockTitle>
        <FriendList friends={sorted} balances={balances} changes={changes}
          onTap={(p) => openForm({ source: "manual", draft: { title: "", amount: 0, currency: lastCurWith(p.id) ?? lastCur, payerId: ME, participantIds: [ME, p.id] } })}
          onOpen={(p) => go({ s: "friend", id: p.id })} onReorder={reorderFriends} />
        {bar()}
      </Page>
    );
  } else if (screen.s === "friend") {
    const p = people.find((x) => x.id === screen.id)!;
    const list = expenses.filter((e) => involves(e, ME) && involves(e, p.id));
    content = page(p.name, <>
      <Block strong inset>
        <div className={muted}>Баланс</div>
        <div className="relative text-left text-2xl font-semibold [&>div]:text-left"><BalanceLines m={balances[p.id]} ch={changes[p.id]} /></div>
        {nonZero(balances[p.id]).length > 1 && <Button tonal colors={tonalBtn} large className="mt-3" onClick={() => go({ s: "net", id: p.id })}>Свести в одну валюту</Button>}
      </Block>
      {!p.hasAccount && (
        <Block strong inset>
          {p.name} пока без аккаунта. Отправь ссылку — после входа эти траты привяжутся к аккаунту.
          <CopyLink label="Скопировать ссылку-приглашение" />
        </Block>
      )}
      <BlockTitle>Общие траты</BlockTitle>
      <List strong inset dividers>
        {list.length === 0 && <ListItem title="Пока ничего" />}
        {list.map((e) => expenseItem(e, p.id))}
      </List>
      {bar({ title: "", amount: 0, currency: lastCurWith(p.id) ?? lastCur, payerId: ME, participantIds: [ME, p.id] })}
    </>);
  } else if (screen.s === "expense") {
    const e = expenses.find((x) => x.id === screen.id)!;
    const toggleDeleted = () =>
      saveExpense({ ...e, deleted: !e.deleted, log: [...e.log, { who: "Я", when: today(), text: e.deleted ? "восстановил трату" : "удалил трату" }] });
    const parts = (list: Expense["payers"]) => (
      <List strong inset dividers>{list.map((p) => <ListItem key={p.personId} title={name(p.personId)} after={fmt(p.amount, e.currency)} />)}</List>
    );
    content = page(e.title, <>
      <Block strong inset>
        <div className={`text-3xl font-semibold ${e.deleted ? "line-through opacity-55" : ""}`}>{fmt(e.amount, e.currency)}</div>
        <div className={muted}>{ruDate(e.date)}{e.tag ? ` · #${e.tag}` : ""}{e.source === "voice" ? " · внесено голосом" : ""}</div>
      </Block>
      <BlockTitle>Кто платил</BlockTitle>{parts(e.payers)}
      <BlockTitle>Доли</BlockTitle>{parts(e.shares)}
      <BlockTitle>История</BlockTitle>
      <List strong inset dividers>{e.log.map((l, i) => <ListItem key={i} title={`${l.who} ${l.text}`} after={ruDate(l.when)} />)}</List>
      <Block className="space-y-2">
        {!e.deleted && <Button tonal colors={tonalBtn} large onClick={() => openForm({ editId: e.id, source: e.source })}>Изменить</Button>}
        <Button clear large colors={clearBtn} className={e.deleted ? "" : "!text-[#E0245E]"} onClick={toggleDeleted}>{e.deleted ? "Восстановить" : "Удалить"}</Button>
      </Block>
    </>);
  } else if (screen.s === "net") {
    content = page(`Взаимозачёт: ${name(screen.id)}`,
      <NetForm bal={balances[screen.id] ?? {}} onApply={(items) => {
        setNettings((ns) => [...ns, ...items.map(({ sign, ...it }) => ({
          id: uid(), date: today(), ...it,
          debtor: sign > 0 ? screen.id : ME, creditor: sign > 0 ? ME : screen.id,
        }))]);
        back();
      }} />);
  } else if (screen.s === "history") {
    content = page("История", <HistoryList expenses={expenses} nettings={nettings} tags={tags} name={name} open={(id) => go({ s: "expense", id })} />);
  } else {
    const meP = people.find((x) => x.id === ME)!;
    const card = "rounded-2xl bg-white p-4";
    content = page("Настройки", (
      <div className="space-y-3 px-4 pt-2 text-[#111827]">
        <div className={`${card} flex flex-col items-center pt-6 pb-5`}>
          <button className="relative" aria-label="Сменить аватарку" onClick={openAvatarPicker}>
            <Face person={meP} className="size-24" />
            <span className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full bg-[#a5b4fc] text-[#111827] shadow-md ring-2 ring-white"><Pencil className="size-4" /></span>
          </button>
          <input aria-label="Имя" value={profileName} onChange={(e) => rename(e.target.value)} maxLength={24} placeholder="Твоё имя"
            className="mt-4 w-full bg-transparent text-center text-2xl font-semibold outline-none placeholder:opacity-35" />
          <div className="mt-1 flex items-center gap-1.5 text-sm opacity-55"><Send className="size-3.5" />Вход через Telegram</div>
          <button className="mt-4 flex h-10 items-center gap-2 rounded-full bg-black/5 px-4 text-[15px] font-medium active:bg-black/10" onClick={openAvatarPicker}>
            <Shuffle className="size-4" />Сменить аватарку
          </button>
        </div>

        <div className={card}>
          <div className="mb-3 text-sm opacity-55">Внешний вид</div>
          <PillSegmented value={pref} onChange={choosePref} options={[{ value: "auto", label: "Авто" }, { value: "ios", label: "iOS" }, { value: "material", label: "Android" }]} />
          <p className={`${muted} mt-3`}>Авто: на Android — вид Android, на остальных устройствах — вид iOS.</p>
        </div>

        <button className="h-12 w-full rounded-2xl bg-white font-medium text-[#E0245E] active:bg-black/5" onClick={() => void logout()}>Выйти</button>
      </div>
    ));
  }

  const editingExp = form?.editId ? expenses.find((x) => x.id === form.editId) : undefined;

  return (
    <App theme={theme} safeAreas>
      {content}
      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} title={editingExp ? "Изменить трату" : "Новая трата"}>
        {form && (
          <ExpenseForm
            key={form.key} people={people} tags={tags} editing={editingExp} lastCurWith={lastCurWith} draft={form.draft} defaultCur={lastCur}
            requestAddPerson={(cb) => { setAddCb(() => cb); setAddOpen(true); }}
            onSave={(data) => {
              if (editingExp) {
                const changes: string[] = [];
                if (editingExp.amount !== data.amount || editingExp.currency !== data.currency) changes.push(`сумма ${fmt(editingExp.amount, editingExp.currency)} → ${fmt(data.amount, data.currency)}`);
                if (editingExp.title !== data.title) changes.push(`название «${editingExp.title}» → «${data.title}»`);
                if (JSON.stringify([editingExp.payers, editingExp.shares]) !== JSON.stringify([data.payers, data.shares])) changes.push("плательщик или доли");
                if (editingExp.date !== data.date) changes.push("дата");
                if ((editingExp.tag ?? "") !== (data.tag ?? "")) changes.push("тег");
                saveExpense({ ...editingExp, ...data, log: [...editingExp.log, { who: "Я", when: today(), text: `изменил: ${changes.join(", ") || "без изменений"}` }] });
              } else {
                saveExpense({ ...data, id: uid(), createdBy: ME, source: form.source, deleted: false, log: [{ who: "Я", when: today(), text: form.source === "voice" ? "внёс трату голосом" : "внёс трату" }] });
              }
              setFormOpen(false);
            }}
          />
        )}
      </BottomSheet>
      {toast && (
        <div className="rise pointer-events-none fixed inset-x-4 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-[70] flex justify-center">
          <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl bg-[#111827]/92 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
            <span className="text-center">{toast.text}</span>
            {toast.action && <button className="shrink-0 rounded-full bg-white/15 px-3 py-1 font-medium active:bg-white/25" onClick={toast.action.run}>{toast.action.label}</button>}
          </div>
        </div>
      )}
      <BottomSheet open={avatarOpen} onClose={() => setAvatarOpen(false)} title="Аватарка">
        <div className="px-4 pt-2 pb-4">
          <div className="grid grid-cols-4 gap-3">
            {avatarSeeds.map((seed) => {
              const on = seed === (people.find((x) => x.id === ME)?.avatarSeed ?? ME);
              return (
                <button key={seed} aria-label="Выбрать аватарку" aria-pressed={on} onClick={() => pickAvatar(seed)} className="relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUri(seed)} alt="" draggable={false} className={`size-full rounded-full bg-black/5 object-cover transition ${on ? "ring-2 ring-[#111827] ring-offset-2 ring-offset-[#f6f6f8]" : "active:scale-95"}`} />
                  {on && <Check className="absolute -right-0.5 -bottom-0.5 size-5 rounded-full bg-[#111827] p-0.5 text-white" />}
                </button>
              );
            })}
          </div>
          <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white font-medium active:bg-black/5"
            onClick={() => setAvatarSeeds(freshSeeds(people.find((x) => x.id === ME)?.avatarSeed ?? ME))}>
            <Shuffle className="size-5" />Показать другие
          </button>
        </div>
      </BottomSheet>
      <AddPersonSheet open={addOpen} onClose={() => setAddOpen(false)} onAdd={(n) => { const id = addPerson(n); addCb?.(id); }} />
      <Actions opened={menuOpen} onBackdropClick={() => setMenuOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>{profileName || "Профиль"}</ActionsLabel>
          <ActionsButton onClick={() => { setMenuOpen(false); go({ s: "history" }); }}>История</ActionsButton>
          <ActionsButton onClick={() => { setMenuOpen(false); go({ s: "settings" }); }}>Настройки</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton bold onClick={() => setMenuOpen(false)}>Отмена</ActionsButton>
        </ActionsGroup>
      </Actions>
    </App>
  );
}

// Friends list. A quick tap opens a new expense; press and hold a row, then drag it up or down to change the order.
// No handles or icons: the row lifts, the others slide out of the way, and on release it settles into the new place.
function FriendList({ friends, balances, changes, onTap, onOpen, onReorder }: {
  friends: Person[]; balances: Record<string, CurMap>; changes: Record<string, CurMap>;
  onTap: (p: Person) => void; onOpen: (p: Person) => void; onReorder: (ids: string[]) => void;
}) {
  type Drag = { i: number; dy: number; target: number; settling: boolean };
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const geo = useRef<{ tops: number[]; heights: number[] }>({ tops: [], heights: [] });
  const press = useRef<{ x: number; y: number; i: number; id: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const suppressClick = useRef(false);
  const friendsRef = useRef(friends); friendsRef.current = friends;
  const onReorderRef = useRef(onReorder); onReorderRef.current = onReorder;
  const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch {} };
  const update = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  // While a row is being dragged the page must not scroll. That needs a non-passive native listener registered up front.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const handlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);
  if (!handlers.current) {
    const detach = () => {
      window.removeEventListener("pointermove", handlers.current!.move);
      window.removeEventListener("pointerup", handlers.current!.up);
      window.removeEventListener("pointercancel", handlers.current!.up);
    };
    const move = (e: PointerEvent) => {
      const st = press.current;
      if (!st || e.pointerId !== st.id) return;
      const d = dragRef.current;
      if (!d) {
        // Moved before the hold finished: the user is scrolling, not reordering.
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) { if (st.timer) clearTimeout(st.timer); press.current = null; detach(); }
        return;
      }
      const { tops, heights } = geo.current, n = tops.length, i = d.i;
      const dy = Math.max(tops[0] - tops[i], Math.min(tops[n - 1] + heights[n - 1] - (tops[i] + heights[i]), e.clientY - st.y));
      const center = tops[i] + heights[i] / 2 + dy;
      let target = 0;
      for (let j = 0; j < n; j++) if (j !== i && tops[j] + heights[j] / 2 < center) target++;
      if (target !== d.target) buzz(6);
      update({ ...d, dy, target });
    };
    const up = (e: PointerEvent) => {
      const st = press.current;
      if (!st || e.pointerId !== st.id) return;
      if (st.timer) clearTimeout(st.timer);
      press.current = null; detach();
      const d = dragRef.current;
      if (!d) return; // a plain tap: the click handler takes over
      const { heights } = geo.current, i = d.i, t = d.target;
      let finalDy = 0;
      if (t > i) for (let j = i + 1; j <= t; j++) finalDy += heights[j];
      else if (t < i) for (let j = t; j < i; j++) finalDy -= heights[j];
      update({ ...d, dy: finalDy, settling: true });
      setTimeout(() => {
        if (t !== i) {
          const ids = friendsRef.current.map((f) => f.id);
          const [moved] = ids.splice(i, 1);
          ids.splice(t, 0, moved);
          onReorderRef.current(ids);
        }
        update(null);
        setTimeout(() => { suppressClick.current = false; }, 60);
      }, 210);
    };
    handlers.current = { move, up };
  }

  const begin = (e: React.PointerEvent, i: number) => {
    if (dragRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const st = { x: e.clientX, y: e.clientY, i, id: e.pointerId, timer: null as ReturnType<typeof setTimeout> | null };
    st.timer = setTimeout(() => {
      if (press.current !== st) return;
      const rects = rows.current.map((el) => el!.getBoundingClientRect());
      geo.current = { tops: rects.map((r) => r.top), heights: rects.map((r) => r.height) };
      suppressClick.current = true;
      buzz(15);
      update({ i, dy: 0, target: i, settling: false });
    }, 380);
    press.current = st;
    window.addEventListener("pointermove", handlers.current!.move);
    window.addEventListener("pointerup", handlers.current!.up);
    window.addEventListener("pointercancel", handlers.current!.up);
  };

  return (
    <div ref={listRef} className="mx-4 rounded-2xl bg-white">
      {friends.map((p, j) => {
        const lifted = drag?.i === j;
        let ty = 0;
        if (drag) {
          if (lifted) ty = drag.dy;
          else if (j > drag.i && j <= drag.target) ty = -geo.current.heights[drag.i];
          else if (j < drag.i && j >= drag.target) ty = geo.current.heights[drag.i];
        }
        return (
          <div key={p.id} ref={(el) => { rows.current[j] = el; }} role="button" tabIndex={0}
            onPointerDown={(e) => begin(e, j)} onContextMenu={(e) => e.preventDefault()}
            onClick={() => { if (!suppressClick.current) onTap(p); }}
            onKeyDown={(e) => { if (e.key === "Enter") onTap(p); }}
            style={{
              touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none",
              transform: drag ? `translate3d(0, ${ty}px, 0)${lifted && !drag.settling ? " scale(1.025)" : ""}` : undefined,
              transition: drag && !(lifted && !drag.settling) ? "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
              zIndex: lifted ? 20 : undefined, position: "relative",
            }}
            className={`flex items-center gap-3 border-b border-black/10 px-4 py-3 last:border-b-0 ${lifted ? "rounded-2xl bg-[#f3f4ff] shadow-[0_14px_32px_rgba(17,24,39,0.24)] ring-1 ring-[#a5b4fc]/70" : "active:bg-black/5"} ${changes[p.id] ? "flash-row" : ""}`}>
            <Face person={p} className="size-11" />
            <div className="min-w-0 flex-1">
              <div>{p.name}{!p.hasAccount && <span className="ml-2 text-xs opacity-55">без аккаунта</span>}</div>
              <div className="text-sm"><BalanceInline m={balances[p.id]} ch={changes[p.id]} /></div>
            </div>
            <span className="relative flex items-center">
              <DeltaBadge ch={changes[p.id]} />
              <button className="-m-2 grid place-items-center p-3 opacity-55" aria-label={`Открыть: ${p.name}`}
                onClick={(ev) => { ev.stopPropagation(); onOpen(p); }}><ChevronRight className="size-5" /></button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Wordmark "Zero" where the letter O is the two-halves ring.
function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-bold tracking-tight text-[#111827] ${className}`} role="img" aria-label="Zero">
      <span aria-hidden>Zer</span>
      <svg viewBox="0 0 56 56" className="ml-[0.03em] size-[0.66em] translate-y-[0.03em]" aria-hidden>
        <path d="M24.2 6.3A22 22 0 0 0 24.2 49.7" fill="none" stroke="#a5b4fc" strokeWidth="11" strokeLinecap="round" />
        <path d="M31.8 6.3A22 22 0 0 1 31.8 49.7" fill="none" stroke="#111827" strokeWidth="11" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CopyLink({ label }: { label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button tonal colors={tonalBtn} large className="mt-3" onClick={async () => {
      try { await navigator.clipboard.writeText("https://example.com/invite/demo"); } catch {}
      setDone(true);
    }}>
      <span className="flex items-center gap-2">{done ? <Check className="size-4" /> : <Copy className="size-4" />}{done ? "Скопировано" : label}</span>
    </Button>
  );
}

function AddPersonSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string) => unknown }) {
  const [nick, setNick] = useState("");
  const [searched, setSearched] = useState(false);
  const [nm, setNm] = useState("");
  return (
    <BottomSheet open={open} onClose={onClose} title="Добавить человека" z={60}>
      <Block className="!my-3">
        <div className="mx-auto mb-1 size-32 rounded-xl border-8 border-white bg-[repeating-conic-gradient(#111_0_25%,#fff_0_50%)] bg-[length:22px_22px]" aria-label="QR-код (заглушка)" />
        <CopyLink label="Скопировать ссылку-приглашение" />
      </Block>
      <List strong inset className="!my-3">
        <ListInput label="Найти по нику в Telegram" type="text" placeholder="@nick" value={nick} onChange={(e: InputEv) => { setNick(e.target.value); setSearched(false); }} />
      </List>
      <Block>
        <Button tonal colors={tonalBtn} disabled={!nick.trim()} onClick={() => setSearched(true)}>Найти</Button>
        {searched && <p className={`${muted} mt-2`}>В прототипе поиск не подключён</p>}
      </Block>
      <List strong inset className="!my-3">
        <ListInput label="Или добавить без аккаунта" info="Привяжется позже по ссылке" type="text" placeholder="Имя" value={nm} onChange={(e: InputEv) => setNm(e.target.value)} />
      </List>
      <Block className="!mt-2">
        <Button colors={mainBtn} disabled={!nm.trim()} onClick={() => { onAdd(nm.trim()); setNm(""); onClose(); }}>Добавить</Button>
      </Block>
    </BottomSheet>
  );
}

type FormData = Pick<Expense, "title" | "amount" | "currency" | "date" | "payers" | "shares" | "tag">;

function ExpenseForm({ people, tags, editing, draft, defaultCur, onSave, requestAddPerson, lastCurWith }: {
  people: Person[]; tags: string[]; editing?: Expense; draft?: Draft; defaultCur: Cur; onSave: (d: FormData) => void;
  requestAddPerson: (cb: (id: string) => void) => void; lastCurWith: (personId: string) => Cur | undefined;
}) {
  const init = editing
    ? { title: editing.title, amount: editing.amount, currency: editing.currency, payerId: editing.payers[0].personId, participantIds: editing.shares.map((s) => s.personId) }
    : draft ?? { title: "", amount: 0, currency: defaultCur, payerId: ME, participantIds: [ME] };
  const wasEqual = !editing || new Set(editing.shares.map((s) => s.amount)).size <= 2;
  const [amountStr, setAmountStr] = useState(init.amount ? String(init.amount / 100).replace(".", ",") : "");
  // Own keypad for the amount, so the system keyboard never covers the form. It hides while a text field is in use.
  const [pad, setPad] = useState(false);
  const amountRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  // Which dropdown is open under the two tiles; the date picker and tag select are native.
  const [dd, setDd] = useState<null | "payer" | "split" | "cur">(null);
  const [curQuery, setCurQuery] = useState("");
  const [tagNew, setTagNew] = useState(false);
  // A new expense starts with the amount focused; focusing it shows the keypad.
  useEffect(() => {
    if (editing || draft?.amount) return;
    setPad(true);
    // The sheet is still sliding in on mount, so focus once it is visible.
    const t = setTimeout(() => amountRef.current?.focus(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = (k: string) => setAmountStr((prev) => {
    if (k === "back") return prev.slice(0, -1);
    if (k === ",") return prev.includes(",") ? prev : (prev || "0") + ",";
    if (prev.includes(",") && prev.split(",")[1].length >= 2) return prev;
    if (prev === "0") return k;
    if (prev.replace(",", "").length >= 9) return prev;
    return prev + k;
  });
  const onAmountKey = (e: React.KeyboardEvent) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === "," || e.key === ".") press(",");
    else if (e.key === "Backspace") press("back");
  };
  const pretty = (v: string) => {
    const [i, d] = v.split(",");
    const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return d !== undefined ? `${grouped},${d}` : grouped;
  };
  const [currency, setCurrency] = useState<Cur>(init.currency);
  const [curTouched, setCurTouched] = useState(!!editing);
  const [title, setTitle] = useState(init.title);
  const [payerId, setPayerId] = useState(init.payerId);
  const [ids, setIds] = useState<string[]>(init.participantIds);
  const [mode, setMode] = useState<"equal" | "exact">(wasEqual ? "equal" : "exact");
  const [exact, setExact] = useState<Record<string, string>>(
    editing ? Object.fromEntries(editing.shares.map((s) => [s.personId, String(s.amount / 100)])) : {},
  );
  const [date, setDate] = useState(editing?.date ?? today());
  const [tag, setTag] = useState(editing?.tag ?? "");

  const toMinor = (s: string) => Math.round(parseFloat((s || "0").replace(",", ".")) * 100) || 0;
  const amount = toMinor(amountStr);
  const shares = mode === "equal" ? splitEqual(amount, ids, payerId) : ids.map((personId) => ({ personId, amount: toMinor(exact[personId]) }));
  const sum = shares.reduce((a, s) => a + s.amount, 0);
  const error =
    amount <= 0 ? "Введи сумму" :
    ids.length === 0 ? "Выбери, на кого делим" :
    ids.length === 1 && ids[0] === payerId ? "Добавь хотя бы одного человека, кроме плательщика" :
    mode === "exact" && sum !== amount ? `Доли в сумме дают ${fmt(sum, currency)}, а трата ${fmt(amount, currency)}` : "";

  // Until the user picks a currency by hand, follow the last one used with the single other participant.
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    const others = next.filter((x) => x !== ME);
    if (!curTouched && others.length === 1) {
      const c = lastCurWith(others[0]);
      if (c) setCurrency(c);
    }
  };

  const card = "rounded-2xl bg-white p-4";
  const plain = "w-full bg-transparent text-base outline-none placeholder:opacity-40";
  
  // What this expense means for me: positive = I am owed, negative = I owe.
  const myResult = error ? 0 : pairDebts({ payers: [{ personId: payerId, amount }], shares } as Expense)
    .reduce((a, d) => a + (d.to === ME ? d.amount : d.from === ME ? -d.amount : 0), 0);
  const others = [...new Set([payerId, ...ids])].filter((x) => x !== ME);
  const nameOf = (id: string) => people.find((x) => x.id === id)?.name ?? "";
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const dateLabel = date === today() ? "Сегодня" : date === yesterday ? "Вчера" : ruDate(date);

  return (
    <div className="space-y-3 px-4 pt-2 text-[#111827]"
      // Hide the keypad on click, not on press: hiding earlier moves the layout and the tap misses its target.
      onClickCapture={(e) => {
        const t = e.target as HTMLElement;
        if (!t.closest("[data-amount],[data-pad]")) setPad(false);
        if (!t.closest("[data-dd]")) setDd(null);
      }}>
      <div className={card}>
        <div className="flex items-center gap-3">
          <div data-amount ref={amountRef} role="textbox" aria-label="Сумма" tabIndex={0}
            onClick={() => setPad(true)} onKeyDown={onAmountKey}
            className="min-w-0 flex-1 cursor-text truncate text-4xl font-semibold tabular-nums outline-none">
            {amountStr ? pretty(amountStr) : <span className="opacity-25">0</span>}
            {pad && <span className="ml-0.5 inline-block h-8 w-0.5 translate-y-1 animate-pulse bg-[#111827]" />}
          </div>
          <div data-dd className="relative shrink-0">
            <button aria-label="Валюта" aria-expanded={dd === "cur"} onClick={() => { setDd(dd === "cur" ? null : "cur"); setCurQuery(""); }}
              className={`flex h-10 items-center gap-1.5 rounded-full bg-black/5 pr-3 pl-4 text-base font-medium transition ${dd === "cur" ? "ring-2 ring-[#a5b4fc]" : ""}`}>
              {SYMBOL[currency]} {currency}
              <ChevronDown className={`size-4 opacity-55 transition ${dd === "cur" ? "rotate-180" : ""}`} />
            </button>
            {/* Drops straight out of the pill and floats over the form, so nothing moves. No autofocus: the keyboard would jump the layout. */}
            {dd === "cur" && (
              <div className="rise absolute top-full right-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-3rem)] rounded-2xl bg-white p-2 shadow-[0_14px_40px_rgba(17,24,39,0.24)] ring-1 ring-black/5">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50" />
                  <input className="h-10 w-full rounded-xl bg-black/5 pr-3 pl-9 text-base outline-none placeholder:opacity-40" placeholder="Поиск валюты" aria-label="Поиск валюты"
                    value={curQuery} onChange={(e) => setCurQuery(e.target.value)} />
                </div>
                <div className="mt-1 max-h-56 overflow-y-auto overscroll-contain">
                  {(() => {
                    const q = curQuery.trim().toLowerCase().replace(/ё/g, "е");
                    const list = CURS.filter((c) => !q || `${c} ${CUR_INFO[c].name} ${CUR_INFO[c].symbol}`.toLowerCase().replace(/ё/g, "е").includes(q));
                    if (list.length === 0) return <div className="px-2 py-4 text-center text-sm opacity-55">Ничего не нашлось</div>;
                    return list.map((c) => (
                      <button key={c} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left ${currency === c ? "bg-[#a5b4fc]/25" : ""}`}
                        onClick={() => { setCurrency(c); setCurTouched(true); setDd(null); setCurQuery(""); }}>
                        <span className="w-8 shrink-0 text-center text-lg opacity-70">{CUR_INFO[c].symbol}</span>
                        <span className="font-medium">{c}</span>
                        <span className="min-w-0 flex-1 truncate text-sm opacity-55">{CUR_INFO[c].name}</span>
                        {currency === c && <Check className="size-5 shrink-0 opacity-70" />}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
        <input className={`${plain} mt-3 border-t border-black/10 pt-3`} placeholder="На что?" aria-label="Название"
          value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* The outcome sits right under the amount, so it stays on screen however the dropdowns below are opened. */}
      {amount > 0 && mode === "exact" && sum !== amount && (
        <div className="rise flex items-center justify-between rounded-2xl bg-white px-4 py-3">
          <span className="opacity-70">{sum < amount ? "Осталось распределить" : "Больше суммы на"}</span>
          <span className={`text-lg font-semibold tabular-nums ${sum > amount ? neg : ""}`}>{fmt(Math.abs(amount - sum), currency)}</span>
        </div>
      )}
      {amount > 0 && myResult !== 0 && (
        <div className="rise flex items-center justify-between rounded-2xl bg-white px-4 py-3">
          <span className="opacity-70">{myResult > 0 ? "Тебе должны" : "Ты должен"}{others.length === 1 ? ` · ${nameOf(others[0])}` : ""}</span>
          <span className={`text-lg font-semibold tabular-nums ${myResult > 0 ? pos : neg}`}>{fmt(myResult, currency)}</span>
        </div>
      )}

      {/* Two selects side by side: who paid (one person) and who it is split between (several). */}
      <div className="grid grid-cols-2 gap-3" data-dd>
        <button className={`rounded-2xl bg-white p-3 text-left transition ${dd === "payer" ? "ring-2 ring-[#a5b4fc]" : ""}`} onClick={() => setDd(dd === "payer" ? null : "payer")}>
          <div className="text-[11px] opacity-55">Платил</div>
          <div className="mt-1 flex items-center gap-2">
            <Face person={people.find((x) => x.id === payerId)!} className="size-8" />
            <span className="min-w-0 flex-1 truncate font-medium">{payerId === ME ? "Я" : nameOf(payerId)}</span>
            <ChevronDown className={`size-4 shrink-0 opacity-55 transition ${dd === "payer" ? "rotate-180" : ""}`} />
          </div>
        </button>
        <button className={`rounded-2xl bg-white p-3 text-left transition ${dd === "split" ? "ring-2 ring-[#a5b4fc]" : ""}`} onClick={() => setDd(dd === "split" ? null : "split")}>
          <div className="flex items-baseline justify-between gap-2 text-[11px] opacity-55">
            <span className="shrink-0">Делим на</span>
            <span className="truncate">{mode === "exact" ? "по суммам" : ids.length > 1 && amount > 0 ? `по ${num(Math.floor(amount / ids.length))}` : "поровну"}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center">
              {ids.slice(0, 4).map((id, i) => <Face key={id} person={people.find((x) => x.id === id)!} className={`size-8 ring-2 ring-white ${i ? "-ml-3" : ""}`} />)}
              {ids.length > 4 && <span className="-ml-3 grid size-8 place-items-center rounded-full bg-black/10 text-xs font-medium ring-2 ring-white">+{ids.length - 4}</span>}
              {ids.length === 0 && <span className="grid size-8 place-items-center rounded-full border border-dashed border-black/30 text-xs opacity-55">?</span>}
            </span>
            <ChevronDown className={`size-4 shrink-0 opacity-55 transition ${dd === "split" ? "rotate-180" : ""}`} />
          </div>
        </button>
      </div>

      {dd === "payer" && (
        <div data-dd className="rise rounded-2xl bg-white p-2">
          {people.map((p) => (
            <button key={p.id} className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${payerId === p.id ? "bg-[#a5b4fc]/25" : ""}`}
              onClick={() => { setPayerId(p.id); setDd(null); }}>
              <Face person={p} className="size-9" />
              <span className="flex-1 truncate">{p.id === ME ? "Я" : p.name}</span>
              {payerId === p.id && <Check className="size-5 opacity-70" />}
            </button>
          ))}
        </div>
      )}

      {dd === "split" && (
        <div data-dd className="rise rounded-2xl bg-white p-3">
          <PillSegmented value={mode} onChange={setMode} options={[{ value: "equal", label: "Поровну" }, { value: "exact", label: "По суммам" }]} />
          <div className="mt-2 space-y-0.5">
            {people.map((p) => {
              const on = ids.includes(p.id);
              const share = shares.find((x) => x.personId === p.id)?.amount ?? 0;
              return (
                <div key={p.id} role="button" tabIndex={0} onClick={() => toggle(p.id)} aria-pressed={on}
                  className={`flex items-center gap-3 rounded-xl px-2 py-1.5 transition ${on ? "bg-[#a5b4fc]/25" : ""}`}>
                  <Face person={p} className={`size-9 transition ${on ? "" : "opacity-50"}`} />
                  <span className={`flex-1 truncate ${on ? "" : "opacity-60"}`}>{p.id === ME ? "Я" : p.name}</span>
                  {on && mode === "equal" && amount > 0 && <span className="tabular-nums opacity-70">{fmt(share, currency)}</span>}
                  {on && mode === "exact" && (
                    <input className="h-9 w-28 rounded-xl bg-black/5 px-3 text-right text-base tabular-nums outline-none" inputMode="decimal" placeholder="0" aria-label={`Сумма: ${p.name}`}
                      value={exact[p.id] ?? ""} onClick={(e) => e.stopPropagation()} onChange={(e) => setExact((x) => ({ ...x, [p.id]: e.target.value }))} />
                  )}
                </div>
              );
            })}
            <button className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left opacity-70" onClick={() => requestAddPerson((id) => setIds((l) => [...l, id]))}>
              <span className="grid size-9 place-items-center rounded-full border border-dashed border-black/30"><UserPlus className="size-4" /></span>
              <span>Добавить человека</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* The real date input covers the whole tile, so a tap opens the system calendar directly. */}
        <label className="relative flex h-12 cursor-pointer items-center gap-2 rounded-2xl bg-white px-4">
          <CalendarDays className="size-5 opacity-55" />
          <span>{dateLabel}</span>
          <input type="date" aria-label="Дата" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
            onClick={(e) => { try { e.currentTarget.showPicker(); } catch {} }} />
        </label>
        {/* Native select: existing tags, "no tag" and "new tag"; the system picker does the work. */}
        <label className={`relative flex h-12 cursor-pointer items-center gap-2 rounded-2xl px-4 ${tag.trim() || tagNew ? "bg-[#111827] text-white" : "bg-white"}`}>
          <Hash className="size-5 shrink-0 opacity-60" />
          <span className="min-w-0 flex-1 truncate">{tagNew ? "Новый тег" : tag.trim() || "Тег"}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
          <select aria-label="Тег" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={tagNew ? "__new" : tag.trim()}
            onChange={(e) => {
              if (e.target.value === "__new") { setTagNew(true); setTag(""); }
              else { setTagNew(false); setTag(e.target.value); }
            }}>
            <option value="">Без тега</option>
            {[...new Set([...tags, tag.trim()].filter(Boolean))].map((t) => <option key={t} value={t}>#{t}</option>)}
            <option value="__new">+ Новый тег…</option>
          </select>
        </label>
      </div>
      {tagNew && (
        <input autoFocus className="rise h-12 w-full rounded-2xl bg-white px-4 text-base outline-none placeholder:opacity-40" placeholder="Название тега" aria-label="Название нового тега"
          value={tag} onChange={(e) => setTag(e.target.value)}
          onBlur={() => { if (!tag.trim()) setTagNew(false); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      )}

      <div className="sticky bottom-0 -mx-4 bg-[#f6f6f8] px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {pad && (
          // preventDefault keeps focus on the amount, so tapping a key does not hide the keypad.
          <div data-pad className="mb-3 grid grid-cols-3 gap-1.5" onMouseDown={(e) => e.preventDefault()}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "back"].map((k) => (
              <button key={k} className="h-11 rounded-xl bg-white text-xl font-medium active:bg-black/10" aria-label={k === "back" ? "Стереть" : k} onClick={() => press(k)}>
                {k === "back" ? <Delete className="mx-auto size-5" /> : k}
              </button>
            ))}
          </div>
        )}
        {/* Hidden while typing: a hint appearing above the button would shift the keys under the finger. */}
        {error && amount > 0 && !pad && <p className="mb-2 text-center text-sm text-[#E0245E]">{error}</p>}
        <Button large colors={mainBtn} disabled={!!error} onClick={() => onSave({
          title: title.trim() || "Трата", amount, currency, date,
          payers: [{ personId: payerId, amount }], shares, tag: tag.trim() || undefined,
        })}>Сохранить</Button>
      </div>
    </div>
  );
}

function NetForm({ bal, onApply }: {
  bal: CurMap;
  onApply: (items: { fromCur: Cur; fromAmount: number; toCur: Cur; toAmount: number; rate: number; sign: number }[]) => void;
}) {
  const items = nonZero(bal);
  const [target, setTarget] = useState<Cur>(items[0][0]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const rows = items.filter(([c]) => c !== target).map(([c, v]) => {
    const key = `${c}>${target}`;
    const r = parseFloat((rates[key] ?? "").replace(",", ".")) || rate(c, target);
    return { c, v, key, r, converted: Math.round(Math.abs(v) * r) * Math.sign(v) };
  });
  const total = (bal[target] ?? 0) + rows.reduce((a, r) => a + r.converted, 0);
  return (
    <>
      <BlockTitle>В какую валюту свести</BlockTitle>
      <Chips options={items.map(([c]) => ({ value: c, label: `${c} ${SYMBOL[c]}` }))} selected={[target]} onPick={setTarget} />
      <List strong inset dividers>
        {rows.map((r) => (
          <ListInput key={r.key} type="text" inputMode="decimal"
            label={<><Money v={r.v} cur={r.c} /> → <Money v={r.converted} cur={target} /></>}
            info="Курс на сегодня, можно поправить"
            value={rates[r.key] ?? String(+r.r.toFixed(4))} onChange={(e: InputEv) => setRates((x) => ({ ...x, [r.key]: e.target.value }))} />
        ))}
        {(bal[target] ?? 0) !== 0 && <ListItem title={`Уже в ${SYMBOL[target]}`} after={<Money v={bal[target]!} cur={target} />} />}
      </List>
      <Block strong inset>
        <div className={muted}>Итог после взаимозачёта</div>
        <div className="text-2xl font-semibold">{total === 0 ? "в расчёте" : <Money v={total} cur={target} />}</div>
      </Block>
      <Block className="space-y-3">
        <p className={muted}>Курсы в прототипе выдуманные. Курс фиксируется в момент взаимозачёта и потом не меняется.</p>
        <Button large colors={mainBtn} onClick={() => onApply(rows.map((r) => ({
          fromCur: r.c, fromAmount: Math.abs(r.v), toCur: target, toAmount: Math.abs(r.converted), rate: r.r, sign: Math.sign(r.v),
        })))}>Свести</Button>
      </Block>
    </>
  );
}

function HistoryList({ expenses, nettings, tags, name, open }: {
  expenses: Expense[]; nettings: Netting[]; tags: string[]; name: (id: string) => string; open: (id: string) => void;
}) {
  const [tag, setTag] = useState("all");
  const byTag = tag !== "all";
  const events = [
    ...expenses.filter((e) => !byTag || e.tag === tag).flatMap((e) => e.log.map((l, i) => ({ key: e.id + i, when: l.when, text: `${l.who} ${l.text}`, sub: `${e.title} · ${fmt(e.amount, e.currency)}`, id: e.id as string | null }))),
    ...(byTag ? [] : nettings.map((n) => ({ key: n.id, when: n.date, text: `Взаимозачёт: ${name(n.debtor)} → ${name(n.creditor)}`, sub: `${fmt(n.fromAmount, n.fromCur)} → ${fmt(n.toAmount, n.toCur)} по курсу ${+n.rate.toFixed(4)}`, id: null }))),
  ].sort((a, b) => b.when.localeCompare(a.when));
  return (
    <>
      <Chips options={[{ value: "all", label: "Все" }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]} selected={[tag]} onPick={setTag} />
      <List strong inset dividers>
        {events.map((ev) => (
          <ListItem key={ev.key} link={!!ev.id} chevron={false} title={ev.text} subtitle={ev.sub} after={ruDate(ev.when)} onClick={() => ev.id && open(ev.id)} />
        ))}
      </List>
    </>
  );
}
