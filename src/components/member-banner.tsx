import { bannerKind } from "@/lib/access";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { viewerAccess } from "@/server/auth/access";
import { readSession } from "@/server/auth/session";
import { getViewer } from "@/server/auth/viewer";
import { storeMode } from "@/server/store";
import { MemberBannerView } from "./member-banner-client";

/**
 * The membership notice at the top of the site, only for the signed-in member it
 * concerns: renewal due in the last 7 days of the month, deposit being checked,
 * membership ended, or starting soon. Wrap in <Suspense fallback={null}>.
 */
export async function MemberBanner() {
  if (storeMode() === "unconfigured") return null;
  if (!(await readSession())) return null;
  const now = await requestNow();
  const viewer = await getViewer();
  if (!viewer?.member) return null;
  const access = viewerAccess(viewer, now);
  const kind = bannerKind(access);
  if (!kind) return null;
  return <MemberBannerView kind={kind} monthKey={toDateKey(now).slice(0, 7)} startsOn={access.startsOn} />;
}
