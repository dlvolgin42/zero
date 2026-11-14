import type { NextRequest } from "next/server";
import { setDeleted, upsertExpense, type ExpenseInput } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

// The id is made on the device, so saving the same expense twice (a retry, an offline sync) never duplicates it.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const { id } = await ctx.params;
  return withMe(request, (me, body) => upsertExpense(me, id, (body ?? {}) as ExpenseInput));
}

// { "deleted": true } removes the expense from the balance but keeps it in the history; false restores it.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/expenses/[id]">) {
  const { id } = await ctx.params;
  return withMe(request, (me, body) => setDeleted(me, id, (body as { deleted?: unknown } | null)?.deleted === true));
}
