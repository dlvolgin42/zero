import type { NextRequest } from "next/server";
import { createNetting, type NettingInput } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  return withMe(request, (me, body) => createNetting(me, (body ?? {}) as NettingInput), 201);
}
