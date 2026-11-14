import type { NextRequest } from "next/server";
import { loadState } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  return withMe(request, (me) => loadState(me));
}
