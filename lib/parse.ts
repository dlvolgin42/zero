// Rule-based stand-in for the AI step "phrase -> expense draft". Prototype only.
import { Cur, Person } from "./model";

export interface Draft {
  title: string;
  amount: number;
  currency: Cur;
  payerId: string;
  participantIds: string[];
}

const CUR_WORDS: [RegExp, Cur][] = [
  [/евро|€/i, "EUR"],
  [/доллар|бакс|\$/i, "USD"],
  [/лари|₾/i, "GEL"],
  [/руб|₽/i, "RUB"],
];

const stem = (s: string) => s.toLowerCase().replace(/ё/g, "е").slice(0, 4);

export function parsePhrase(text: string, people: Person[], me: string, defaultCur: Cur): Draft {
  const norm = text.toLowerCase().replace(/ё/g, "е");
  const num = norm.match(/(\d[\d\s]*)(?:[.,](\d{1,2}))?\s*(тыс|к(?![а-я]))?/);
  let amount = 0;
  if (num) {
    amount = parseInt(num[1].replace(/\s/g, ""), 10) * 100 + (num[2] ? parseInt(num[2].padEnd(2, "0"), 10) : 0);
    if (num[3]) amount *= 1000;
  }
  const currency = CUR_WORDS.find(([re]) => re.test(norm))?.[1] ?? defaultCur;
  const others = people.filter((p) => p.id !== me);
  const mentioned = others.filter((p) => norm.includes(stem(p.name)));
  const paid = "(?:заплатил|заплатила|платил|платила)";
  const payer = others.find((p) =>
    new RegExp(`${paid}\\s+${stem(p.name)}|${stem(p.name)}[а-я]*\\s+${paid}`).test(norm),
  );
  const place = norm.match(/(?:^|\s)в(?:о)?\s+([а-я]+)/);
  const title = place ? place[1][0].toUpperCase() + place[1].slice(1) : "Трата";
  return {
    title,
    amount,
    currency,
    payerId: payer?.id ?? me,
    participantIds: [me, ...mentioned.map((p) => p.id)],
  };
}
