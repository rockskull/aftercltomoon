import { connection, type NextRequest } from "next/server";
import { isSessionId } from "@/lib/little-club";
import { fromThisSite, leaveClub, littleClubGate } from "@/server/little-club";

const done = (status = 204) => new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/little-club/presence/leave — best effort, sent with `fetch(…, { keepalive: true })`
 * when the game tab is hidden or closed. Drops only this tab's own entry, so the person's other
 * open tabs stay ON. If it never arrives, the 75 s window turns the tab OFF anyway.
 *
 * Body: { sessionId } (JSON, or the same as text when sent as a beacon).
 */
export async function POST(request: NextRequest) {
  await connection();
  if (!fromThisSite(request)) return done(403);
  let sessionId: unknown;
  try {
    sessionId = (JSON.parse(await request.text()) as { sessionId?: unknown } | null)?.sessionId;
  } catch {
    return done(400);
  }
  if (!isSessionId(sessionId)) return done(400);
  const gate = await littleClubGate();
  if (!gate.ok) return done(gate.reason === "login" ? 401 : 403);
  await leaveClub(gate, sessionId, Date.now());
  return done();
}
