import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeBalances, isSettled } from "../src/balances";
import { settleUp } from "../src/settle";
import { computeShares } from "../src/split";

describe("computeBalances", () => {
  it("credits the payer and debits each share", () => {
    const balances = computeBalances([
      {
        paidBy: "alice",
        currency: "USD",
        shares: [
          { userId: "alice", amount: 1000 },
          { userId: "bob", amount: 1000 },
          { userId: "carol", amount: 1000 },
        ],
      },
    ]);
    expect(balances).toEqual({ USD: { alice: 2000, bob: -1000, carol: -1000 } });
  });

  it("keeps currencies in separate ledgers", () => {
    const balances = computeBalances([
      { paidBy: "a", currency: "USD", shares: [{ userId: "b", amount: 500 }] },
      { paidBy: "b", currency: "EUR", shares: [{ userId: "a", amount: 700 }] },
    ]);
    expect(balances).toEqual({ USD: { a: 500, b: -500 }, EUR: { a: -700, b: 700 } });
  });

  it("applies recorded settlements", () => {
    const balances = computeBalances(
      [{ paidBy: "a", currency: "USD", shares: [{ userId: "b", amount: 500 }] }],
      [{ fromUserId: "b", toUserId: "a", amount: 500, currency: "USD" }],
    );
    expect(isSettled(balances)).toBe(true);
  });

  it("lists members with nothing owed at zero", () => {
    const balances = computeBalances([{ paidBy: "a", currency: "USD", shares: [{ userId: "b", amount: 1 }] }], [], ["a", "b", "c"]);
    expect(balances.USD).toEqual({ a: 1, b: -1, c: 0 });
  });

  it("always sums to zero, and following the settle-up plan clears every ledger", () => {
    const members = ["ana", "bo", "cy", "di", "ed"];
    const expense = fc.record({
      payer: fc.constantFrom(...members),
      currency: fc.constantFrom("USD", "EUR", "JPY"),
      total: fc.integer({ min: 1, max: 1_000_000 }),
      participants: fc.subarray(members, { minLength: 1 }),
    });
    fc.assert(
      fc.property(fc.array(expense, { maxLength: 25 }), (raw) => {
        const expenses = raw.map((e) => {
          const split = computeShares(e.total, "equal", e.participants.map((userId) => ({ userId, value: 0 })));
          if (!split.ok) throw new Error(split.error);
          return { paidBy: e.payer, currency: e.currency, shares: split.shares };
        });
        const balances = computeBalances(expenses);
        const settlements = Object.entries(balances).flatMap(([currency, ledger]) => {
          expect(Object.values(ledger).reduce((a, b) => a + b, 0)).toBe(0);
          return settleUp(ledger).map((t) => ({ fromUserId: t.from, toUserId: t.to, amount: t.amount, currency }));
        });
        expect(isSettled(computeBalances(expenses, settlements))).toBe(true);
      }),
    );
  });
});
