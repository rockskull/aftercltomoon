import { connection, NextResponse, type NextRequest } from "next/server";
import { BUBBLE_MAX } from "@/lib/little-club";
import { fromThisSite, littleClubGate, saveClubStatus, type StatusResult } from "@/server/little-club";

const reply = (body: StatusResult, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * PATCH /api/little-club/status — save (or, with null / "", clear) the caller's one status line.
 * Only on the save / clear buttons, never per keystroke. Only ever the caller's own row (from the
 * session cookie, re-checked against the live member list); there is no way to name someone else.
 * Others see the change with their next sync (about 30 s).
 */
export async function PATCH(request: NextRequest) {
  await connection();
  if (!fromThisSite(request)) return reply({ ok: false, message: "잘못된 요청이에요." }, 403);
  const body = (await request.json().catch(() => null)) as { statusText?: unknown } | null;
  const text = body?.statusText;
  if (!(text === null || typeof text === "string") || (typeof text === "string" && text.length > BUBBLE_MAX * 8)) {
    return reply({ ok: false, message: "말풍선은 한 줄로 짧게 적어 주세요." }, 400);
  }
  const gate = await littleClubGate({ fresh: true });
  if (!gate.ok) return reply({ ok: false, message: gate.reason === "login" ? "로그인이 필요해요." : "이용이 중지된 계정이에요. 운영진에게 문의해 주세요." }, gate.reason === "login" ? 401 : 403);
  const result = await saveClubStatus(gate, text ?? "", Date.now());
  return reply(result, result.ok ? 200 : 409);
}
