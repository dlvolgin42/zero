import type { NextRequest } from "next/server";
import { currentRates } from "@/lib/server/rates";
import { withMe } from "@/lib/server/http";

// Today's rates (units per US dollar). Empty when no rates could be loaded yet: the app then keeps its built-in sample rates.
export async function GET(request: NextRequest) {
  return withMe(request, async () => (await currentRates()) ?? { day: null, perUsd: {} });
}
