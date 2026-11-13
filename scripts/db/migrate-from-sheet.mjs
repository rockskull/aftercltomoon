// One-time move of the club data from the Google Sheet (via the Apps Script gateway)
// into the database (Neon). Reads .env.local: DATABASE_URL, CLUB_API_URL, CLUB_API_SECRET.
//
//   npm run db:migrate              creates the tables and copies the sheet (refuses if the DB already has data)
//   npm run db:migrate -- --replace empties the club tables first, then copies again (only before switching over!)
//   npm run db:migrate -- --schema-only   just creates/updates the tables
//
// The sheet is only read, never changed. Everything is copied in one transaction.
import { Pool } from "@neondatabase/serverless";
import { existsSync } from "node:fs";
import { idColumn, sqlTableName, TABLES, toDbValue, UNIQUE_INDEXES } from "../../src/server/store/schema.ts";
import { RADIO_SEED, watchUrl } from "../../src/lib/radio.ts";
import { STAMP_CATALOG } from "../../src/lib/stamps.ts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = new Set(process.argv.slice(2));
const { DATABASE_URL, CLUB_API_URL, CLUB_API_SECRET } = process.env;
const SCHEMA = process.env.DATABASE_SCHEMA || "public";
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set (.env.local)");

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const tableRef = (t) => `${q(SCHEMA)}.${q(sqlTableName(t))}`;
const names = Object.keys(TABLES);

function schemaSql() {
  const out = [`create schema if not exists ${q(SCHEMA)}`];
  for (const t of names) {
    out.push(`create table if not exists ${tableRef(t)} (_seq bigserial primary key, ${TABLES[t].map((c) => `${q(c)} text not null default ''`).join(", ")})`);
    for (const c of TABLES[t]) out.push(`alter table ${tableRef(t)} add column if not exists ${q(c)} text not null default ''`);
    out.push(`create index if not exists ${q(`${sqlTableName(t)}_id`)} on ${tableRef(t)} (${q(idColumn(t))})`);
  }
  out.push(`create index if not exists "audit_log_commit" on ${tableRef("AuditLog")} ("commit_id")`);
  // e.g. one review per member per problem (MOON PROBLEMS)
  for (const u of UNIQUE_INDEXES) out.push(`create unique index if not exists ${q(u.name)} on ${tableRef(u.table)} (${u.columns.map(q).join(", ")})`);
  return out.join(";\n");
}

const pool = new Pool({ connectionString: DATABASE_URL });
await pool.query(schemaSql());
console.log(`tables ready in schema "${SCHEMA}" (${names.length})`);
if (args.has("--schema-only")) {
  await pool.end();
  process.exit(0);
}

// 1) Read every tab the deployed gateway knows (tabs it doesn't know come back missing).
if (!CLUB_API_URL || !CLUB_API_SECRET) throw new Error("CLUB_API_URL / CLUB_API_SECRET are not set (.env.local)");
const res = await fetch(CLUB_API_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "read", secret: CLUB_API_SECRET, tables: names }),
});
const body = await res.json().catch(() => null);
if (!res.ok || !body || body.ok === false || !body.tables) throw new Error(`sheet read failed (HTTP ${res.status}${body?.error ? `, ${body.error}` : ""})`);
const sheet = body.tables;

// 2) Never overwrite data by accident.
const counts = {};
for (const t of names) counts[t] = (await pool.query(`select count(*)::int as n from ${tableRef(t)}`)).rows[0].n;
const filled = names.filter((t) => counts[t] > 0);
if (filled.length && !args.has("--replace")) {
  console.error(`The database already has data (${filled.map((t) => `${t} ${counts[t]}`).join(", ")}).`);
  console.error("Nothing was changed. Use --replace only before the site has switched to the database.");
  await pool.end();
  process.exit(1);
}

// 3) Rows to write: the sheet as it is, plus the defaults the old gateway hadn't created yet.
const rows = {};
const dropped = {};
for (const t of names) {
  const source = Array.isArray(sheet[t]) ? sheet[t] : [];
  for (const r of source) for (const k of Object.keys(r)) if (!TABLES[t].includes(k) && r[k] !== "") (dropped[t] ??= new Set()).add(k);
  rows[t] = source;
}
const added = [];
if (!rows.StampDefinitions.length) {
  rows.StampDefinitions = STAMP_CATALOG.map((s) => ({ stamp_id: s.id, name: s.name, description: s.description, image_key: s.imageKey, active: true }));
  added.push("StampDefinitions: 4 stamps");
}
if (!rows.RadioTracks.length) {
  const createdAt = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + "+09:00";
  rows.RadioTracks = RADIO_SEED.map((s, i) => ({
    track_id: `RT-SEED-${String(i + 1).padStart(2, "0")}`, title: s.title, artist: s.artist, youtube_url: watchUrl(s.videoId),
    youtube_video_id: s.videoId, requested_by: "AFTER CL TO MOON", display_name: "AFTER CL TO MOON", message: "", source: "seed",
    sort_order: i + 1, created_at: createdAt, status: "active", deleted_at: "", deleted_by: "",
  }));
  added.push("RadioTracks: 14 seed tracks");
}
const settingKeys = new Set(rows.Settings.map((r) => String(r.key ?? "").trim()));
if (!settingKeys.has("radio_player")) {
  rows.Settings = [...rows.Settings, { key: "radio_player", value: "off", description: "AFTER HOURS RADIO 아지트 플레이어. 음악 이용 권한을 확인한 뒤 on으로 바꾸기" }];
  added.push("Settings: radio_player = off");
}

// 4) Copy everything in one transaction.
const client = await pool.connect();
try {
  await client.query("begin");
  if (args.has("--replace")) await client.query(`truncate ${names.map(tableRef).join(", ")} restart identity`);
  for (const t of names) {
    const cols = TABLES[t];
    for (let i = 0; i < rows[t].length; i += 100) {
      const chunk = rows[t].slice(i, i + 100);
      const values = [];
      const tuples = chunk.map((r, j) => `(${cols.map((c, k) => {
        values.push(toDbValue(r[c]));
        return `$${j * cols.length + k + 1}`;
      }).join(", ")})`);
      await client.query(`insert into ${tableRef(t)} (${cols.map(q).join(", ")}) values ${tuples.join(", ")}`, values);
    }
  }
  await client.query("commit");
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  client.release();
}

// 5) Check: every table holds exactly what was meant to be copied.
let mismatch = false;
console.log("\ntable                  sheet → database");
for (const t of names) {
  const n = (await pool.query(`select count(*)::int as n from ${tableRef(t)}`)).rows[0].n;
  const expected = rows[t].length;
  const fromSheet = Array.isArray(sheet[t]) ? sheet[t].length : "(no tab)";
  if (n !== expected) mismatch = true;
  console.log(`  ${t.padEnd(20)} ${String(fromSheet).padStart(8)} → ${String(n).padStart(5)}${n !== expected ? `  ✗ expected ${expected}` : ""}`);
}
if (added.length) console.log(`\nadded defaults: ${added.join(" · ")}`);
for (const [t, cols] of Object.entries(dropped)) console.log(`not copied (columns the site doesn't use): ${t}: ${[...cols].join(", ")}`);
const emptyIds = names.flatMap((t) => rows[t].filter((r) => !String(r[idColumn(t)] ?? "").trim()).length ? [`${t} ${rows[t].filter((r) => !String(r[idColumn(t)] ?? "").trim()).length}`] : []);
if (emptyIds.length) console.log(`rows without an id (copied as they are): ${emptyIds.join(", ")}`);
console.log(mismatch ? "\n✗ counts do not match" : "\n✓ all rows copied");
await pool.end();
process.exit(mismatch ? 1 : 0);
