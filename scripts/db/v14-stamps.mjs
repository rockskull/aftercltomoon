// v1.4 MOON STAMPS data step (Postgres). Safe to run more than once.
//
//   npm run db:v14-stamps            → dry run: shows what would change, writes nothing
//   npm run db:v14-stamps -- --apply → applies it in one transaction (with AuditLog rows)
//
// What it does:
//   • ST-02 definition row → "100 HOLDS" / "100홀드 지구력 문제 완등" (same id, same artwork key,
//     same on/off). The row is the only thing that would otherwise keep showing "FIRST TOP",
//     because a definitions row overrides the code's defaults.
//   • ST-05 SIX MOONS / ST-06 TWELVE MOONS definition rows are added when missing.
//   • Existing ST-02 awards are NOT changed or converted. They are listed for the crew to
//     review (an award given as FIRST TOP is not automatically a 100 HOLDS achievement).
// It never deletes anything and never touches other stamps, awards or memberships.
// Honors DATABASE_SCHEMA (e.g. a throwaway test schema). Never prints connection strings.
import { Pool } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env.local).");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const schema = process.env.DATABASE_SCHEMA || "public";
const q = (table) => `"${schema.replace(/"/g, '""')}"."${table}"`;
const LOCK_KEY = 7202611; // same lock the app's commits take

const TARGET = {
  "ST-02": { name: "100 HOLDS", description: "100홀드 지구력 문제 완등", image_key: "st-02" },
  "ST-05": { name: "SIX MOONS", description: "6+1개월 회원권 등록", image_key: "st-05" },
  "ST-06": { name: "TWELVE MOONS", description: "12+2개월 회원권 등록", image_key: "st-06" },
};

const now = Date.now();
const day = new Date(now + 9 * 3_600_000).toISOString();
const seoulIso = `${day.slice(0, 19)}+09:00`;
const ymd = day.slice(2, 10).replace(/-/g, "");
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const newId = (prefix, n) => `${prefix}-${ymd}-${Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);

  const defs = (await client.query(`select stamp_id, name, description, image_key, active from ${q("stamp_definitions")} order by _seq`)).rows;
  const awards02 = (
    await client.query(`select award_id, member_id, awarded_at from ${q("stamp_awards")} where upper(trim(stamp_id)) = 'ST-02' order by _seq`)
  ).rows;

  console.log(`schema ${schema} · ${apply ? "APPLY" : "dry run (add --apply to write)"}`);
  console.log("definitions now:");
  for (const d of defs) console.log(`  ${d.stamp_id}  ${d.name} / ${d.description} / ${d.image_key} / active=${d.active}`);

  const commitId = newId("C", 8);
  const audits = [];
  const actions = [];

  // ST-02: rename in place (keep image_key and active as they are).
  const row02 = defs.find((d) => d.stamp_id.trim().toUpperCase() === "ST-02");
  if (row02 && (row02.name !== TARGET["ST-02"].name || row02.description !== TARGET["ST-02"].description)) {
    const before = { name: row02.name, description: row02.description };
    const after = { name: TARGET["ST-02"].name, description: TARGET["ST-02"].description };
    actions.push(`update ST-02: ${before.name} / ${before.description} → ${after.name} / ${after.description}`);
    if (apply) {
      await client.query(`update ${q("stamp_definitions")} set name = $1, description = $2 where stamp_id = $3`, [after.name, after.description, row02.stamp_id]);
    }
    audits.push({ target: row02.stamp_id, before: JSON.stringify(before), after: JSON.stringify(after) });
  }

  // ST-05, ST-06: add the rows when missing (the site already falls back to the same defaults).
  for (const id of ["ST-05", "ST-06"]) {
    if (defs.some((d) => d.stamp_id.trim().toUpperCase() === id)) continue;
    const row = { stamp_id: id, ...TARGET[id], active: "true" };
    actions.push(`add ${id}: ${row.name} / ${row.description}`);
    if (apply) {
      await client.query(
        `insert into ${q("stamp_definitions")} (stamp_id, name, description, image_key, active) values ($1, $2, $3, $4, $5)`,
        [row.stamp_id, row.name, row.description, row.image_key, row.active],
      );
    }
    audits.push({ target: id, before: "", after: JSON.stringify(row) });
  }

  if (apply) {
    for (const a of audits) {
      await client.query(
        `insert into ${q("audit_log")} (log_id, commit_id, actor_id, action, target_id, before_value, after_value, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [newId("LOG", 6), commitId, "migration:v1.4", "stamp.definition", a.target, a.before, a.after, seoulIso],
      );
    }
  }

  console.log(actions.length ? `changes${apply ? "" : " (not written)"}:` : "nothing to change — already v1.4.");
  for (const a of actions) console.log(`  ${a}`);
  console.log(
    awards02.length
      ? `existing ST-02 awards to review by the crew (left as they are, not converted): ${awards02.length}\n${awards02.map((a) => `  ${a.award_id} · ${a.awarded_at}`).join("\n")}`
      : "existing ST-02 awards: none (nothing to review).",
  );

  await client.query(apply ? "commit" : "rollback");
  if (apply && actions.length) console.log(`committed ${commitId} (${audits.length} audit rows). The site's cached reads refresh within 5 minutes.`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("failed, nothing written:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
