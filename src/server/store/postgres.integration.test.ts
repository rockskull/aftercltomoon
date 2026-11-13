import { existsSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planRegistration } from "../domain/admin-data";
import { planApproval } from "../domain/operations";
import { planAddTrack, planDeleteTrack, seedRows } from "../domain/radio";
import { RADIO_SEED } from "@/lib/radio";
import type { Commit } from "./commit";
import { commitToDb, readFromDb, schemaStatements } from "./postgres";
import { TABLES, toDbValue, sqlTableName, type Row, type TableName } from "./schema";

/**
 * Runs the real Postgres store against the club database, in a throwaway schema
 * (dropped afterwards). Opt-in: DB_TEST=1 npx vitest run postgres.integration
 */
const enabled = process.env.DB_TEST === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");
const SCHEMA = `acm_test_${Date.now().toString(36)}`;
const NOW = Date.parse("2026-11-13T12:00:00+09:00");

describe.skipIf(!enabled)("postgres store (integration)", { timeout: 60_000 }, () => {
  let pool: Pool;

  async function insert(table: TableName, rows: Row[]) {
    const cols = TABLES[table];
    for (const row of rows) {
      await pool.query(
        `insert into "${SCHEMA}"."${sqlTableName(table)}" (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
        cols.map((c) => toDbValue(row[c])),
      );
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_SCHEMA = SCHEMA;
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(schemaStatements(SCHEMA).join(";\n"));
    await insert("Members", [
      { member_id: "OP", name: "운영", email: "op@x.dev", role: "admin", status: "active", joined_at: "2026-01-01" },
      { member_id: "NEW", name: "새 회원", email: "new@x.dev", role: "member", status: "applicant" },
      { member_id: "REG", name: "등록 회원", email: "reg@x.dev", depositor_name: "등록", role: "member", status: "applicant" },
    ]);
    await insert("Plans", [{ plan_id: "1M", name: "1개월", price: 80000, first_price: 100000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "" }]);
    await insert("Payments", [{ payment_id: "P-1", member_id: "NEW", depositor_name: "새", amount: 100000, plan_id: "1M", status: "pending", requested_at: "2026-11-12T10:00:00+09:00" }]);
    await insert("RadioTracks", seedRows(RADIO_SEED, "2026-11-12T20:00:00+09:00"));
  }, 60_000);

  afterAll(async () => {
    await pool.query(`drop schema if exists "${SCHEMA}" cascade`);
    await pool.end();
  }, 60_000);

  it("reads rows back in order, with numbers and checkboxes typed like the sheet", async () => {
    const t = await readFromDb(["Plans", "Members", "RadioTracks"]);
    expect(t.Plans![0]).toMatchObject({ price: 80000, first_price: 100000, active: true, plan_id: "1M" });
    expect(t.Members!.map((m) => m.member_id)).toEqual(["OP", "NEW", "REG"]);
    expect(t.RadioTracks).toHaveLength(14);
    expect(t.RadioTracks![0]).toMatchObject({ track_id: "RT-SEED-01", sort_order: 1 });
  });

  it("applies an approval in one transaction, and a retry of the same commit is a no-op", async () => {
    const data = await readFromDb(["Members", "Plans", "Payments", "Memberships", "Notifications"]);
    const planned = planApproval(data, { now: NOW, actorId: "OP", paymentId: "P-1" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    const commit = planned.commit as Commit;
    expect(await commitToDb(commit)).toEqual({ ok: true });
    expect(await commitToDb(commit)).toEqual({ ok: true, duplicate: true });
    const after = await readFromDb(["Payments", "Memberships", "Members", "AuditLog"]);
    expect(after.Payments![0]).toMatchObject({ status: "approved", approved_by: "OP" });
    expect(after.Memberships).toHaveLength(1);
    // Approved in November 2026: memberships start from the club's first month (2026-12).
    expect(after.Memberships![0]).toMatchObject({ start_date: "2026-12-01", end_date: "2026-12-31", status: "active" });
    expect(after.Members!.find((m) => m.member_id === "NEW")).toMatchObject({ status: "active" });
    expect(after.AuditLog).toHaveLength(1);
  });

  it("MEMBERSHIP REGISTRATION: a pending charge with its months, then one confirmation writes every stretch", async () => {
    const data = await readFromDb(["Members", "Plans", "Payments", "Memberships"]);
    const charge = planRegistration(data, {
      now: NOW,
      actorId: "OP",
      actorRole: "admin",
      memberId: "REG",
      depositorName: "",
      requestId: "it-req-000001",
      request: { kind: "monthly", months: ["2026-12", "2027-01", "2027-03"], start: "2026-12-15" },
    });
    if ("refuse" in charge) throw new Error(charge.refuse);
    expect(await commitToDb(charge.commit as Commit)).toEqual({ ok: true });
    expect(await commitToDb(charge.commit as Commit)).toEqual({ ok: true, duplicate: true }); // a double submit lands once

    const pending = await readFromDb(["Members", "Plans", "Payments", "Memberships", "Notifications"]);
    const row = pending.Payments!.find((p) => p.member_id === "REG")!;
    expect(row).toMatchObject({ status: "pending", amount: 203871, requested_start: "2026-12-15" });
    expect(JSON.parse(String(row.registration))).toEqual({ months: ["2026-12", "2027-01", "2027-03"], start: "2026-12-15", fee: 80000 });
    expect(pending.Memberships!.filter((m) => m.member_id === "REG")).toHaveLength(0);

    const confirm = planApproval(pending, { now: NOW, actorId: "OP", actorRole: "admin", paymentId: String(row.payment_id), depositedAt: "2026-11-20" });
    if ("refuse" in confirm) throw new Error(confirm.refuse);
    expect(await commitToDb(confirm.commit as Commit)).toEqual({ ok: true });
    const after = await readFromDb(["Payments", "Memberships"]);
    expect(after.Payments!.find((p) => p.member_id === "REG")).toMatchObject({ status: "approved", deposited_at: "2026-11-20" });
    expect(after.Memberships!.filter((m) => m.member_id === "REG").map((m) => [m.start_date, m.end_date, m.source_payment_id])).toEqual([
      ["2026-12-15", "2027-01-31", row.payment_id],
      ["2027-03-01", "2027-03-31", row.payment_id],
    ]);
  });

  it("refuses a commit whose checks no longer hold (conflict) and writes nothing", async () => {
    const data = await readFromDb(["Members", "Plans", "Payments", "Memberships", "Notifications"]);
    // P-1 is approved now; a stale commit planned as if it were pending must conflict.
    const stale = { id: "C-STALE", checks: [{ type: "exists", table: "Payments", id: "P-1", fields: { status: "pending" } }], ops: [{ type: "update", table: "Payments", id: "P-1", set: { note: "x" } }] } as Commit;
    expect(await commitToDb(stale)).toMatchObject({ ok: false, error: "conflict" });
    expect((await readFromDb(["Payments"])).Payments!.find((p) => p.payment_id === "P-1")!.note).toBe("");
    expect(data.Payments!.filter((p) => p.payment_id === "P-1")).toHaveLength(1);
  });

  it("two simultaneous adds of the same video: exactly one lands", async () => {
    const data = await readFromDb(["Members", "RadioTracks"]);
    const make = () => planAddTrack(data, { now: NOW, email: "op@x.dev", sessionName: "", input: { videoId: "cpU7Yrl-AwM", title: "t", artist: "a", message: "" } });
    const a = make();
    const b = make();
    if ("refuse" in a || "refuse" in b) throw new Error("refused");
    const results = await Promise.all([commitToDb(a.commit as Commit), commitToDb(b.commit as Commit)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "conflict" });
    const tracks = (await readFromDb(["RadioTracks"])).RadioTracks!;
    expect(tracks.filter((r) => r.youtube_video_id === "cpU7Yrl-AwM")).toHaveLength(1);
  });

  it("soft-deletes a track by updating its row", async () => {
    const data = await readFromDb(["Members", "RadioTracks"]);
    const planned = planDeleteTrack(data, { now: NOW, email: "op@x.dev", trackId: "RT-SEED-02" });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(await commitToDb(planned.commit as Commit)).toEqual({ ok: true });
    const row = (await readFromDb(["RadioTracks"])).RadioTracks!.find((r) => r.track_id === "RT-SEED-02")!;
    expect(row).toMatchObject({ status: "deleted", deleted_by: "OP" });
  });
});
