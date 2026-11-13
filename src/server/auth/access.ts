import "server-only";
import { memberAccess, MEMBERSHIP_REQUIRED, type BlockReason, type MemberAccess } from "@/lib/access";
import { toDateKey } from "@/lib/dates";
import { readSession } from "./session";
import { getViewer, type Viewer } from "./viewer";

/** A member feature's verdict for the browser: the common codes, the same wording everywhere. */
export type Denied = { ok: false; code: "LOGIN_REQUIRED" | typeof MEMBERSHIP_REQUIRED; reason?: BlockReason; message: string };

export function viewerAccess(viewer: Viewer, now = Date.now()): MemberAccess {
  return memberAccess({
    member: viewer.member,
    memberships: viewer.club.memberships,
    payments: viewer.club.payments,
    todayKey: toDateKey(now),
  });
}

/**
 * Gate for every member write (radio requests, event proposals, …): signed in,
 * in the Members tab, and a membership in effect today (or active staff).
 * Reads the live data, so a renewal approved a moment ago opens it right away.
 */
export async function requireParticipant(): Promise<{ ok: true; viewer: Viewer; access: MemberAccess } | Denied> {
  if (!(await readSession())) return { ok: false, code: "LOGIN_REQUIRED", message: "로그인이 필요해요." };
  const viewer = await getViewer({ fresh: true });
  if (!viewer) return { ok: false, code: "LOGIN_REQUIRED", message: "로그인이 필요해요." };
  const access = viewerAccess(viewer);
  if (!access.canParticipate) {
    return {
      ok: false,
      code: MEMBERSHIP_REQUIRED,
      reason: access.blockReason ?? "expired",
      message: "현재 이용 등록이 확인되지 않았습니다. 클럽 참여 기능을 이용하려면 회원권을 먼저 등록해 주세요.",
    };
  }
  return { ok: true, viewer, access };
}
