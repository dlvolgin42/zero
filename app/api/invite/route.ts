import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/server/auth";
import { myInviteCode } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

// Returns my personal invite link (created on first request).
export async function GET(request: NextRequest) {
  return withMe(request, async (me) => ({ url: `${appUrl()}/join/${(await myInviteCode(me)).code}` }));
}
