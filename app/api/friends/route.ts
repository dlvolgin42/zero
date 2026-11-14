import type { NextRequest } from "next/server";
import { createGhost } from "@/lib/server/data";
import { withMe } from "@/lib/server/http";

// Add a person without an account ("Sasha"); they can be linked to a real account later through an invite.
export async function POST(request: NextRequest) {
  return withMe(request, (me, body) => createGhost(me, (body as { name?: unknown } | null)?.name), 201);
}
