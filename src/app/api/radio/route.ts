import { connection, NextResponse } from "next/server";
import { loadRadio } from "@/server/radio";

/** The playlist for the radio page to poll (~every 20 s). Requester names only for signed-in members. */
export async function GET() {
  await connection(); // always per request, never prerendered
  try {
    return NextResponse.json(await loadRadio(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[radio] list failed", error);
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
