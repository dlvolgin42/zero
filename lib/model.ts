// Core data model and balance math. Amounts are integers in minor units (kopecks, cents).

// Currency list for the prototype. The real app will take the full list from the rates source.
export const CUR_INFO = {
  RUB: { symbol: "₽", name: "Российский рубль", rate: 81 },
  USD: { symbol: "$", name: "Доллар США", rate: 1 },
  EUR: { symbol: "€", name: "Евро", rate: 0.86 },
  GEL: { symbol: "₾", name: "Грузинский лари", rate: 2.7 },
  GBP: { symbol: "£", name: "Фунт стерлингов", rate: 0.76 },
  TRY: { symbol: "₺", name: "Турецкая лира", rate: 42 },
  KZT: { symbol: "₸", name: "Казахстанский тенге", rate: 520 },
  AMD: { symbol: "֏", name: "Армянский драм", rate: 385 },
  AED: { symbol: "AED", name: "Дирхам ОАЭ", rate: 3.67 },
  THB: { symbol: "฿", name: "Тайский бат", rate: 35 },
  CNY: { symbol: "¥", name: "Китайский юань", rate: 7.2 },
  UAH: { symbol: "₴", name: "Украинская гривна", rate: 41 },
  PLN: { symbol: "zł", name: "Польский злотый", rate: 3.9 },
  CZK: { symbol: "Kč", name: "Чешская крона", rate: 23 },
  CHF: { symbol: "CHF", name: "Швейцарский франк", rate: 0.82 },
  RSD: { symbol: "RSD", name: "Сербский динар", rate: 105 },
  JPY: { symbol: "JP¥", name: "Японская иена", rate: 150 },
  KRW: { symbol: "₩", name: "Южнокорейская вона", rate: 1380 },
  INR: { symbol: "₹", name: "Индийская рупия", rate: 84 },
  IDR: { symbol: "Rp", name: "Индонезийская рупия", rate: 15800 },
  VND: { symbol: "₫", name: "Вьетнамский донг", rate: 25000 },
  MYR: { symbol: "RM", name: "Малайзийский ринггит", rate: 4.4 },
  SGD: { symbol: "S$", name: "Сингапурский доллар", rate: 1.34 },
  PHP: { symbol: "₱", name: "Филиппинское песо", rate: 57 },
  HKD: { symbol: "HK$", name: "Гонконгский доллар", rate: 7.8 },
  TWD: { symbol: "NT$", name: "Новый тайваньский доллар", rate: 32 },
  ILS: { symbol: "₪", name: "Израильский шекель", rate: 3.7 },
  EGP: { symbol: "E£", name: "Египетский фунт", rate: 49 },
  MAD: { symbol: "MAD", name: "Марокканский дирхам", rate: 10 },
  SAR: { symbol: "SAR", name: "Саудовский риял", rate: 3.75 },
  QAR: { symbol: "QAR", name: "Катарский риал", rate: 3.64 },
  BRL: { symbol: "R$", name: "Бразильский реал", rate: 5.4 },
  MXN: { symbol: "MX$", name: "Мексиканское песо", rate: 18.5 },
  ARS: { symbol: "AR$", name: "Аргентинское песо", rate: 1000 },
  CLP: { symbol: "CL$", name: "Чилийское песо", rate: 950 },
  COP: { symbol: "CO$", name: "Колумбийское песо", rate: 4200 },
  CAD: { symbol: "C$", name: "Канадский доллар", rate: 1.38 },
  AUD: { symbol: "A$", name: "Австралийский доллар", rate: 1.52 },
  NZD: { symbol: "NZ$", name: "Новозеландский доллар", rate: 1.67 },
  SEK: { symbol: "SEK", name: "Шведская крона", rate: 10.5 },
  NOK: { symbol: "NOK", name: "Норвежская крона", rate: 10.8 },
  DKK: { symbol: "DKK", name: "Датская крона", rate: 6.4 },
  HUF: { symbol: "Ft", name: "Венгерский форинт", rate: 360 },
  RON: { symbol: "lei", name: "Румынский лей", rate: 4.6 },
  BGN: { symbol: "лв", name: "Болгарский лев", rate: 1.68 },
  BYN: { symbol: "Br", name: "Белорусский рубль", rate: 3.3 },
  AZN: { symbol: "₼", name: "Азербайджанский манат", rate: 1.7 },
  UZS: { symbol: "UZS", name: "Узбекский сум", rate: 12700 },
  KGS: { symbol: "KGS", name: "Киргизский сом", rate: 86 },
  ZAR: { symbol: "R", name: "Южноафриканский рэнд", rate: 18 },
} as const;

export type Cur = keyof typeof CUR_INFO;
export const CURS = Object.keys(CUR_INFO) as Cur[];
export const SYMBOL = Object.fromEntries(CURS.map((c) => [c, CUR_INFO[c].symbol])) as Record<Cur, string>;

// Demo rates: units of currency per 1 USD. Placeholder numbers, not real quotes.
export const DEMO_RATE = Object.fromEntries(CURS.map((c) => [c, CUR_INFO[c].rate])) as Record<Cur, number>;

export interface Person {
  id: string;
  name: string;
  hasAccount: boolean;
  nick?: string;
  // Seed for the generated avatar; falls back to the id.
  avatarSeed?: string;
}

export interface Part {
  personId: string;
  amount: number;
}

export interface LogEntry {
  who: string;
  when: string;
  text: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: Cur;
  date: string;
  payers: Part[];
  shares: Part[];
  tag?: string;
  createdBy: string;
  source: "manual" | "voice";
  deleted: boolean;
  log: LogEntry[];
}

// Converts a debt between two people from one currency into another at a fixed rate.
export interface Netting {
  id: string;
  debtor: string;
  creditor: string;
  fromCur: Cur;
  fromAmount: number;
  toCur: Cur;
  toAmount: number;
  rate: number;
  date: string;
}

export type CurMap = Partial<Record<Cur, number>>;

export function rate(from: Cur, to: Cur): number {
  return DEMO_RATE[to] / DEMO_RATE[from];
}

// Absolute amount without the currency sign: "4 000" or "9 418,60".
export function num(amount: number): string {
  const v = Math.abs(amount) / 100;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function fmt(amount: number, cur: Cur): string {
  return `${num(amount)} ${SYMBOL[cur]}`;
}

// Equal split; leftover minor units go to the payer (or the first participant).
export function splitEqual(amount: number, ids: string[], payerId: string): Part[] {
  if (ids.length === 0) return [];
  const base = Math.floor(amount / ids.length);
  const rest = amount - base * ids.length;
  const extraTo = ids.includes(payerId) ? payerId : ids[0];
  return ids.map((personId) => ({ personId, amount: base + (personId === extraTo ? rest : 0) }));
}

// Who owes whom for a single expense. With several payers, debtors pay each
// creditor in proportion to how much that creditor overpaid.
export function pairDebts(e: Expense): { from: string; to: string; amount: number }[] {
  const net = new Map<string, number>();
  for (const p of e.payers) net.set(p.personId, (net.get(p.personId) ?? 0) + p.amount);
  for (const s of e.shares) net.set(s.personId, (net.get(s.personId) ?? 0) - s.amount);
  const creditors = [...net].filter(([, v]) => v > 0);
  const debtors = [...net].filter(([, v]) => v < 0);
  const totalPos = creditors.reduce((a, [, v]) => a + v, 0);
  const out: { from: string; to: string; amount: number }[] = [];
  for (const [d, dv] of debtors) {
    let left = -dv;
    creditors.forEach(([c, cv], i) => {
      const part = i === creditors.length - 1 ? left : Math.round((-dv * cv) / totalPos);
      left -= part;
      if (part > 0) out.push({ from: d, to: c, amount: part });
    });
  }
  return out;
}

// Balances of `me` with every other person: positive = they owe me.
export function balancesFor(me: string, expenses: Expense[], nettings: Netting[]): Record<string, CurMap> {
  const bal: Record<string, CurMap> = {};
  const add = (person: string, cur: Cur, v: number) => {
    bal[person] ??= {};
    bal[person][cur] = (bal[person][cur] ?? 0) + v;
  };
  for (const e of expenses) {
    if (e.deleted) continue;
    for (const d of pairDebts(e)) {
      if (d.to === me) add(d.from, e.currency, d.amount);
      else if (d.from === me) add(d.to, e.currency, -d.amount);
    }
  }
  for (const n of nettings) {
    if (n.creditor === me) {
      add(n.debtor, n.fromCur, -n.fromAmount);
      add(n.debtor, n.toCur, n.toAmount);
    } else if (n.debtor === me) {
      add(n.creditor, n.fromCur, n.fromAmount);
      add(n.creditor, n.toCur, -n.toAmount);
    }
  }
  return bal;
}

export function nonZero(m: CurMap | undefined): [Cur, number][] {
  return CURS.filter((c) => (m?.[c] ?? 0) !== 0).map((c) => [c, m![c]!]);
}

export function involves(e: Expense, personId: string): boolean {
  return e.payers.some((p) => p.personId === personId) || e.shares.some((s) => s.personId === personId);
}
