import type { NextRequest } from "next/server";
import { appUrl } from "@/lib/server/auth";
import { myInviteCode } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

// My invite link. With ?ghost=<id> it is a one-time link for a placeholder person I created ("Sasha without an account").
export async function GET(request: NextRequest) {
  const ghost = request.nextUrl.searchParams.get("ghost");
  return withMe(request, async (me) => ({ url: `${appUrl()}/join/${(await myInviteCode(me, ghost)).code}` }));
}
