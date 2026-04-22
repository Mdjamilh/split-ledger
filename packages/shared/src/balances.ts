import type { Share } from "./split";

/*
 * Net balances. A positive balance means the group owes that person money;
 * negative means they owe the group. Currencies are never mixed: each one
 * has its own ledger, and within a currency the balances always sum to zero.
 */

export interface LedgerExpense {
  paidBy: string;
  currency: string;
  shares: readonly Share[];
}

export interface LedgerSettlement {
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency: string;
}

/** currency -> userId -> net amount in minor units. */
export type Balances = Record<string, Record<string, number>>;

function bump(balances: Balances, currency: string, userId: string, delta: number) {
  const ledger = (balances[currency] ??= {});
  ledger[userId] = (ledger[userId] ?? 0) + delta;
}

export function computeBalances(
  expenses: readonly LedgerExpense[],
  settlements: readonly LedgerSettlement[] = [],
  memberIds: readonly string[] = [],
): Balances {
  const balances: Balances = {};
  for (const expense of expenses) {
    const total = expense.shares.reduce((acc, s) => acc + s.amount, 0);
    bump(balances, expense.currency, expense.paidBy, total);
    for (const share of expense.shares) bump(balances, expense.currency, share.userId, -share.amount);
  }
  for (const s of settlements) {
    // Paying someone back moves the payer up and the receiver down.
    bump(balances, s.currency, s.fromUserId, s.amount);
    bump(balances, s.currency, s.toUserId, -s.amount);
  }
  // Show every member in every ledger, even at zero.
  for (const ledger of Object.values(balances)) {
    for (const id of memberIds) ledger[id] ??= 0;
  }
  return balances;
}

/** True when nobody owes anybody anything in any currency. */
export function isSettled(balances: Balances): boolean {
  return Object.values(balances).every((ledger) => Object.values(ledger).every((v) => v === 0));
}
