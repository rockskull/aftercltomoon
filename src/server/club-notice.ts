import "server-only";
import { DEFAULT_NOTICES, type NoticeItem } from "@/lib/club-notice";
import { toSettings } from "./domain/model";
import { readTables, storeMode } from "./store";

/** CLUB NOTICE as edited in 설정 → 아지트 공지; the defaults when unset or the store can't be read. */
export async function getClubNotices(): Promise<NoticeItem[]> {
  if (storeMode() === "unconfigured") return DEFAULT_NOTICES.map((n) => ({ ...n }));
  try {
    return toSettings((await readTables(["Settings"])).Settings).clubNotice;
  } catch (error) {
    console.error("[notice] read failed", error);
    return DEFAULT_NOTICES.map((n) => ({ ...n }));
  }
}
