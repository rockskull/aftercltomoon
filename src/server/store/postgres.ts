import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
import { applyCommit, type Commit, type CommitResult } from "./commit";

// Commits use a WebSocket connection (an interactive transaction). Node 22+ has a
// global WebSocket; older runtimes get the `ws` package instead.
if (typeof globalThis.WebSocket === "undefined") neonConfig.webSocketConstructor = ws;
import { fromDbValue, idColumn, sqlTableName, TABLES, toDbValue, UNIQUE_INDEXES, type Row, type TableName, type Tables } from "./schema";

/**
 * Club data in Postgres (Neon). Same tables and columns as the old sheet tabs,
 * and the same commit rules (src/server/store/commit.ts): a commit is applied
 * in one transaction under an advisory lock, so commits never interleave —
 * the job LockService did for Apps Script.
 */

const LOCK_KEY = 7_202_611; // any fixed number; all club commits take this one lock

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not set");
  return value;
}

/** Schema for the club tables ("public" unless DATABASE_SCHEMA says otherwise, e.g. for tests). */
export function dbSchema(): string {
  return process.env.DATABASE_SCHEMA || "public";
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
export const qualified = (table: TableName) => `${q(dbSchema())}.${q(sqlTableName(table))}`;

function toRow(table: TableName, record: Record<string, unknown>): Row {
  return Object.fromEntries(TABLES[table].map((c) => [c, fromDbValue(table, c, record[c] as string | null)])) as Row;
}

/** Whole tables in row order, in one round trip. */
export async function readFromDb(tables: TableName[]): Promise<Tables> {
  if (!tables.length) return {};
  const sql = neon(url());
  const results = (await sql.transaction(
    tables.map((t) => sql.query(`select * from ${qualified(t)} order by _seq`)),
    { readOnly: true },
  )) as Array<Array<Record<string, unknown>>>;
  return Object.fromEntries(tables.map((t, i) => [t, results[i].map((r) => toRow(t, r))])) as Tables;
}

/** Applies a commit atomically: duplicate check → checks → validation → writes, under one lock. */
export async function commitToDb(commit: Commit): Promise<CommitResult> {
  const pool = new Pool({ connectionString: url() });
  pool.on("error", (error: unknown) => console.error("[db] idle client error", error));
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const seen = await client.query(`select 1 from ${qualified("AuditLog")} where commit_id = $1 limit 1`, [commit.id]);
    if (seen.rowCount) {
      await client.query("rollback");
      return { ok: true, duplicate: true };
    }

    // Load what the checks and ops look at (AuditLog is only appended to; its duplicate check was done above).
    const names = [...new Set<TableName>([...commit.checks.map((c) => c.table), ...commit.ops.map((o) => o.table)])].filter((t) => t !== "AuditLog");
    const tables: Tables = {};
    for (const t of names) {
      const res = await client.query(`select * from ${qualified(t)} order by _seq`);
      tables[t] = res.rows.map((r: Record<string, unknown>) => toRow(t, r));
    }
    const result = applyCommit(tables, commit); // same rules as the sheet gateway; applies to the in-memory copy
    if (!result.ok) {
      await client.query("rollback");
      return result;
    }

    for (const op of commit.ops) {
      if (op.type === "append") {
        const columns = TABLES[op.table];
        await client.query(
          `insert into ${qualified(op.table)} (${columns.map(q).join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
          columns.map((c) => toDbValue(op.row[c])),
        );
      } else {
        const entries = Object.entries(op.set);
        await client.query(
          `update ${qualified(op.table)} set ${entries.map(([c], i) => `${q(c)} = $${i + 1}`).join(", ")} where ${q(idColumn(op.table))} = $${entries.length + 1}`,
          [...entries.map(([, v]) => toDbValue(v)), op.id],
        );
      }
    }
    await client.query("commit");
    return { ok: true };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

/** CREATE TABLE statements for every club table (safe to run again: only adds what is missing). */
export function schemaStatements(schema = dbSchema()): string[] {
  const statements = [`create schema if not exists ${q(schema)}`];
  for (const table of Object.keys(TABLES) as TableName[]) {
    const name = `${q(schema)}.${q(sqlTableName(table))}`;
    const columns = TABLES[table].map((c) => `${q(c)} text not null default ''`).join(", ");
    statements.push(`create table if not exists ${name} (_seq bigserial primary key, ${columns})`);
    for (const c of TABLES[table]) statements.push(`alter table ${name} add column if not exists ${q(c)} text not null default ''`);
    statements.push(`create index if not exists ${q(`${sqlTableName(table)}_id`)} on ${name} (${q(idColumn(table))})`);
  }
  statements.push(`create index if not exists "audit_log_commit" on ${q(schema)}."audit_log" ("commit_id")`);
  for (const u of UNIQUE_INDEXES) {
    statements.push(`create unique index if not exists ${q(u.name)} on ${q(schema)}.${q(sqlTableName(u.table))} (${u.columns.map(q).join(", ")})`);
  }
  return statements;
}
