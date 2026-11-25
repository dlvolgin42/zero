// Dictated phrase -> expense draft, done by Claude Haiku. The browser turns speech into text; this turns the text into
// amount, currency, payer, participants, title and date. Callers fall back to the rule-based parser when this fails.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CURS, type Cur } from "../model";
import { HttpError } from "./data";

const MODEL = "claude-haiku-5-5";

export type VoicePerson = { id: string; name: string };
export type VoiceDraft = { title: string; amount: number; currency: Cur; payerId: string; participantIds: string[]; date: string };

const Answer = z.object({
  understood: z.boolean(),
  amount: z.number().nullable(),
  currency: z.string(),
  payer_id: z.string(),
  participant_ids: z.array(z.string()),
  title: z.string(),
  date: z.string(),
});

const SYSTEM = `You turn one dictated Russian phrase about a shared expense into a draft for an app that splits expenses between friends.
The speaker is the user ("я"). You get a list of people with ids; refer to people only by those ids.

Fill the fields like this:
- amount: the total amount of the expense as a number, for example 1500 or 12.5. Understand numbers said in words ("полторы тысячи" = 1500, "тыща" = 1000, "пятьсот" = 500) and "к" or "тыс" for thousands. If the phrase gives what each person pays ("по 300 с каждого"), multiply by the number of participants. null if there is no amount.
- currency: a code from the allowed list, by the words used ("евро", "баксов", "лари", "рублей"). If no currency is said, use the default.
- payer_id: who paid. If the phrase does not say, or the speaker paid ("я заплатил", "заплатил за"), use the speaker's id.
- participant_ids: everyone the cost is split between: the speaker and every person mentioned, unless the phrase clearly leaves someone out ("за Сашу" means only Саша owes). Match names in any case and form, including short and affectionate forms (Серёге, с Серёгой, Серёжа all mean Серёга).
- title: what was paid for, in Russian, nominative case, capitalised, one to three words ("Бар", "Такси из аэропорта", "Продукты"). "Трата" if it is not clear.
- date: YYYY-MM-DD. Relative words count from today ("вчера", "позавчера", "в пятницу" = the most recent past Friday). Today if no date is said.
- understood: false if the phrase is not about an expense or has no amount.`;

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// A logged-in user can call this freely, so each one gets a small budget of requests to keep the bill predictable.
const recent = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now(), windowMs = 10 * 60_000, max = 40;
  const list = (recent.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, "too_many_requests");
  list.push(now);
  recent.set(userId, list);
}

export function voiceConfigured() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function parseVoice(userId: string, input: { text: string; people: VoicePerson[]; me: string; defaultCur: Cur; today: string }): Promise<VoiceDraft> {
  if (!voiceConfigured()) throw new HttpError(503, "no_ai");
  rateLimit(userId);
  const { text, people, me, defaultCur, today } = input;
  const ids = new Set(people.map((p) => p.id));
  const weekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];
  const content = [
    `Today: ${today} (${weekday}).`,
    `Default currency: ${defaultCur}. Allowed currencies: ${CURS.join(", ")}.`,
    `People (id = name):`,
    ...people.map((p) => `${p.id} = ${p.id === me ? "я (the speaker)" : p.name}`),
    ``,
    `Phrase: «${text}»`,
  ].join("\n");

  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    // Low effort: a short extraction gains nothing from long thinking, and the user is waiting with the phone in hand.
    output_config: { effort: "low", format: zodOutputFormat(Answer) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const a = res.parsed_output;
  if (res.stop_reason === "refusal" || !a) throw new HttpError(502, "ai_no_answer");

  // Everything the model says is checked against what the app allows.
  const amount = a.understood && a.amount && Number.isFinite(a.amount) && a.amount > 0 ? Math.round(a.amount * 100) : 0;
  const currency = (CURS as string[]).includes(a.currency) ? (a.currency as Cur) : defaultCur;
  const payerId = ids.has(a.payer_id) ? a.payer_id : me;
  const participantIds = [...new Set(a.participant_ids.filter((id) => ids.has(id)))];
  const yearAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 366 * 864e5).toISOString().slice(0, 10);
  const date = isDay(a.date) && a.date <= today && a.date >= yearAgo ? a.date : today;
  const title = a.title.trim().slice(0, 40) || "Трата";
  return { title, amount, currency, payerId, participantIds: participantIds.length ? participantIds : [me], date };
}

// Checks the request body; anything unexpected is a 400.
export function readVoiceBody(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  const me = typeof b.me === "string" ? b.me : "";
  const people = Array.isArray(b.people)
    ? b.people.filter((p): p is VoicePerson => !!p && typeof p.id === "string" && typeof p.name === "string").slice(0, 200)
        .map((p) => ({ id: p.id.slice(0, 64), name: p.name.slice(0, 40) }))
    : [];
  const defaultCur = (CURS as string[]).includes(b.defaultCur as string) ? (b.defaultCur as Cur) : "RUB";
  const serverToday = new Date().toISOString().slice(0, 10);
  // The phone's own date, so "вчера" means yesterday where the user is; the server's UTC date if it looks wrong.
  const today = typeof b.today === "string" && isDay(b.today) && Math.abs(Date.parse(b.today) - Date.parse(serverToday)) <= 2 * 864e5 ? b.today : serverToday;
  if (!text || text.length > 500 || !me || !people.some((p) => p.id === me)) throw new HttpError(400, "bad_request");
  return { text, people, me, defaultCur, today };
}
