import type { NextRequest } from "next/server";
import { setFriendOrder } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

export async function PUT(request: NextRequest) {
  return withMe(request, (me, body) => setFriendOrder(me, (body as { ids?: unknown } | null)?.ids));
}
