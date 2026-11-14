import postgres from "postgres";

// One connection pool per server process (kept on globalThis so dev hot reloads do not open a new pool each time).
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

export class NoDatabaseError extends Error {
  constructor() { super("DATABASE_URL is not set"); }
}

export const hasDatabase = () => Boolean(process.env.DATABASE_URL);

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new NoDatabaseError();
  return (g.__sql ??= postgres(url, { max: 8, idle_timeout: 20, connect_timeout: 10 }));
}
