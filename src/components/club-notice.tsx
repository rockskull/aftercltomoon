import { requestNow } from "@/lib/club-data";
import { getClubNotices } from "@/server/club-notice";
import { ClubNoticeView } from "./club-notice-view";

/**
 * CLUB NOTICE, as admins edit it in 설정 → 아지트 공지 (defaults until then).
 * Public: never the door code, an account number or an amount (the save refuses them).
 * Read per request, so a change shows right after saving.
 */
export async function ClubNotice({ className, headingId = "notice-title" }: { className?: string; headingId?: string }) {
  await requestNow();
  return <ClubNoticeView items={await getClubNotices()} className={className} headingId={headingId} />;
}
