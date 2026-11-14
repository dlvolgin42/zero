// Made-up data for the clickable prototype. Replaced by the real database later.
import { Expense, Person } from "./model";

export const ME = "me";

export const demoPeople: Person[] = [
  { id: ME, name: "Я", hasAccount: true, avatarSeed: "dpnlt8xa" },
  { id: "serega", name: "Серёга", hasAccount: true, nick: "serega" },
  { id: "sasha", name: "Саша", hasAccount: false },
  { id: "katya", name: "Катя", hasAccount: true, nick: "katya" },
];

const log = (who: string, when: string) => [{ who, when, text: "внёс трату" }];

export const demoExpenses: Expense[] = [
  {
    id: "e1",
    title: "Ресторан",
    amount: 600000,
    currency: "RUB",
    date: "2026-11-12",
    payers: [{ personId: ME, amount: 600000 }],
    shares: [
      { personId: ME, amount: 200000 },
      { personId: "serega", amount: 200000 },
      { personId: "sasha", amount: 200000 },
    ],
    createdBy: ME,
    source: "voice",
    deleted: false,
    log: log("Я", "2026-11-12"),
  },
  {
    id: "e2",
    title: "Отель в Тбилиси",
    amount: 30000,
    currency: "EUR",
    date: "2026-11-05",
    payers: [{ personId: "serega", amount: 30000 }],
    shares: [
      { personId: ME, amount: 10000 },
      { personId: "serega", amount: 10000 },
      { personId: "katya", amount: 10000 },
    ],
    tag: "Грузия",
    createdBy: "serega",
    source: "manual",
    deleted: false,
    log: log("Серёга", "2026-11-05"),
  },
  {
    id: "e3",
    title: "Такси из аэропорта",
    amount: 9000,
    currency: "GEL",
    date: "2026-11-04",
    payers: [{ personId: ME, amount: 9000 }],
    shares: [
      { personId: ME, amount: 3000 },
      { personId: "serega", amount: 3000 },
      { personId: "katya", amount: 3000 },
    ],
    tag: "Грузия",
    createdBy: ME,
    source: "manual",
    deleted: false,
    log: log("Я", "2026-11-04"),
  },
];
