import "server-only";
import { entriesFromPayments, type MoneyEntry } from "@/lib/ledger";
import { parsePrivate, toLedgerEntry, type ClubPrivate } from "./domain/model";
import { readTables } from "./store";
import type { TableName, Tables } from "./store/schema";

const MONEY_TABLES: TableName[] = ["Ledger", "Payments", "Members", "Plans"];

/** Ledger entries + income derived from approved payments (needs the MONEY_TABLES). */
export function moneyFrom(tables: Tables): { entries: MoneyEntry[]; club: ClubPrivate } {
  const club = parsePrivate(tables);
  const ledger = (tables.Ledger ?? []).map(toLedgerEntry).filter((e): e is MoneyEntry => e !== null);
  const fromPayments = entriesFromPayments(club.payments, {
    member: (id) => club.members.find((m) => m.id === id)?.name ?? id,
    plan: (id) => club.plans.find((p) => p.id === id)?.name ?? id,
  });
  return { entries: [...ledger, ...fromPayments], club };
}

/** Same, read fresh from the sheet (CSV export). */
export async function loadMoney(): Promise<{ entries: MoneyEntry[]; club: ClubPrivate }> {
  return moneyFrom(await readTables(MONEY_TABLES, { fresh: true }));
}
