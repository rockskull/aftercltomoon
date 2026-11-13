// Shows which database .env.local points at and how many rows each club table has.
//   npm run db:status
// Never prints connection strings or passwords.
import { Pool } from "@neondatabase/serverless";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (.env.local).");
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const t0 = Date.now();
const v = await pool.query("select current_database() as db, split_part(version(), ',', 1) as version");
console.log(`connected in ${Date.now() - t0} ms · database ${v.rows[0].db} · ${v.rows[0].version}`);
const tables = await pool.query(
  "select table_name from information_schema.tables where table_schema = current_schema() and table_type = 'BASE TABLE' order by 1",
);
if (!tables.rows.length) console.log("no tables yet");
for (const { table_name } of tables.rows) {
  const n = await pool.query(`select count(*)::int as n from "${table_name.replace(/"/g, '""')}"`);
  console.log(`  ${table_name.padEnd(22)} ${n.rows[0].n}`);
}
await pool.end();
