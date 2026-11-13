// Read-only check: does the database still hold exactly what the sheet has? (nothing is written)
//   npm run db:compare
// Prints only table names and counts — never row contents.
import { Pool } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { sqlTableName, TABLES, toDbValue } from "../../src/server/store/schema.ts";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { DATABASE_URL, CLUB_API_URL, CLUB_API_SECRET } = process.env;
const SCHEMA = process.env.DATABASE_SCHEMA || "public";
const names = Object.keys(TABLES);

const res = await fetch(CLUB_API_URL, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "read", secret: CLUB_API_SECRET, tables: names }),
});
const body = await res.json();
if (!body?.tables) throw new Error(`sheet read failed (HTTP ${res.status})`);

const pool = new Pool({ connectionString: DATABASE_URL });
const digest = (rows, cols) => createHash("sha256").update(JSON.stringify(rows.map((r) => cols.map((c) => toDbValue(r[c]))))).digest("hex");
let same = true;
for (const t of names) {
  const cols = TABLES[t];
  const sheetRows = Array.isArray(body.tables[t]) ? body.tables[t] : [];
  const dbRows = (await pool.query(`select * from "${SCHEMA}"."${sqlTableName(t)}" order by _seq`)).rows;
  const match = sheetRows.length === dbRows.length && digest(sheetRows, cols) === digest(dbRows, cols);
  if (!match) same = false;
  console.log(`  ${t.padEnd(20)} sheet ${String(sheetRows.length).padStart(4)} · db ${String(dbRows.length).padStart(4)}  ${match ? "same" : "DIFFERENT"}`);
}
console.log(same ? "\n✓ the database matches the sheet" : "\n✗ the sheet changed since the copy");
await pool.end();
process.exit(same ? 0 : 1);
