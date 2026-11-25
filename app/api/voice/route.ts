import type { NextRequest } from "next/server";
import { withMe } from "@/lib/server/http";
import { parseVoice, readVoiceBody } from "@/lib/server/voice";

// Dictated phrase (already text) -> expense draft. 503 "no_ai" when the server has no Claude key: the app then
// falls back to its own rule-based parser.
export async function POST(request: NextRequest) {
  return withMe(request, (me, body) => parseVoice(me, readVoiceBody(body)));
}
