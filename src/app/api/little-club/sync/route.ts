import { connection, NextResponse, type NextRequest } from "next/server";
import { isSessionId, type ClubSyncResponse } from "@/lib/little-club";
import { fromThisSite, littleClubGate, syncClub } from "@/server/little-club";

const reply = (body: ClubSyncResponse, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * POST /api/little-club/sync — THE LITTLE CLUB's one periodic request (every 30 s, only while the
 * game is on screen). It marks this tab ON and answers with everyone's latest status line and ON/OFF.
 *
 * Body: { sessionId } — this tab's random id for this page load. Who is asking comes from the
 * session cookie (checked on every call), never from the body. No positions or motions are sent.
 * The first sync starts the 4-minute play window; after it, the answer is 409 { reason: "cooldown" }.
 */
export async function POST(request: NextRequest) {
  await connection();
  if (!fromThisSite(request)) return reply({ ok: false, reason: "bad-request" }, 403);
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const sessionId = body?.sessionId;
  if (!isSessionId(sessionId)) return reply({ ok: false, reason: "bad-request" }, 400);
  const gate = await littleClubGate();
  if (!gate.ok) return reply({ ok: false, reason: gate.reason }, gate.reason === "login" ? 401 : 403);
  try {
    const result = await syncClub(gate, sessionId, Date.now());
    // cooldown = the 4 minutes are over (the game ends); unavailable = the store could not be read.
    return reply(result, result.ok ? 200 : result.reason === "cooldown" ? 409 : 503);
  } catch (error) {
    console.error("[little-club] sync route failed", error);
    return reply({ ok: false, reason: "unavailable" }, 503);
  }
}
