import {
  computeBalances,
  settleUp,
  type BalancesResponse,
  type Currency,
  type Expense,
  type Settlement,
} from "@split-ledger/shared";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { schema, type Db } from "../db";

const iso = (d: Date) => d.toISOString();

/** A group's expenses, newest first, each with its shares in the order they were entered. */
export async function loadExpenses(db: Db, groupId: string): Promise<Expense[]> {
  const rows = await db
    .select()
    .from(schema.expenses)
    .where(eq(schema.expenses.groupId, groupId))
    .orderBy(desc(schema.expenses.occurredOn), desc(schema.expenses.createdAt));
  if (rows.length === 0) return [];
  const shares = await db
    .select()
    .from(schema.expenseShares)
    .where(
      inArray(
        schema.expenseShares.expenseId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(schema.expenseShares.position));

  const byExpense = new Map<string, Expense["shares"]>();
  for (const s of shares) {
    const list = byExpense.get(s.expenseId) ?? [];
    list.push({ userId: s.userId, amount: s.amount, value: s.value });
    byExpense.set(s.expenseId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount,
    currency: r.currency as Currency,
    paidBy: r.paidBy,
    method: r.method,
    occurredOn: r.occurredOn,
    createdAt: iso(r.createdAt),
    createdBy: r.createdBy,
    shares: byExpense.get(r.id) ?? [],
  }));
}

export async function loadSettlements(db: Db, groupId: string): Promise<Settlement[]> {
  const rows = await db
    .select()
    .from(schema.settlements)
    .where(eq(schema.settlements.groupId, groupId))
    .orderBy(desc(schema.settlements.createdAt));
  return rows.map((r) => ({
    id: r.id,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    amount: r.amount,
    currency: r.currency as Currency,
    createdAt: iso(r.createdAt),
  }));
}

/** Balances per currency (group currency first) with the settle-up plan for each. */
export async function groupBalances(
  db: Db,
  group: { id: string; currency: string },
  memberIds: string[],
): Promise<BalancesResponse> {
  const [expenses, settlements] = await Promise.all([loadExpenses(db, group.id), loadSettlements(db, group.id)]);
  const balances = computeBalances(expenses, settlements, memberIds);
  const currencies = Object.keys(balances).sort((a, b) =>
    a === group.currency ? -1 : b === group.currency ? 1 : a.localeCompare(b),
  ) as Currency[];
  return {
    ledgers: currencies.map((currency) => {
      const ledger = balances[currency]!;
      return {
        currency,
        balances: Object.entries(ledger)
          .map(([userId, net]) => ({ userId, net }))
          .sort((a, b) => b.net - a.net),
        plan: settleUp(ledger),
      };
    }),
    settlements,
  };
}
