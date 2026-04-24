import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyTransfers, settleExact, settleGreedy, settleUp, type Transfer } from "../src/settle";

/** Classic backtracking search for the true minimum (LeetCode 465 style); fine for tiny inputs. */
function bruteForceMinimum(balances: Record<string, number>): number {
  const debts = Object.values(balances).filter((v) => v !== 0);
  const dfs = (start: number): number => {
    while (start < debts.length && debts[start] === 0) start++;
    if (start === debts.length) return 0;
    let best = Infinity;
    for (let i = start + 1; i < debts.length; i++) {
      if (debts[i]! * debts[start]! < 0) {
        debts[i]! += debts[start]!;
        best = Math.min(best, 1 + dfs(start + 1));
        debts[i]! -= debts[start]!;
      }
    }
    return best;
  };
  return dfs(0);
}

/** Arbitrary balances that sum to zero: random values plus one balancing entry. */
const zeroSumBalances = (maxPeople: number, maxAmount = 50_000) =>
  fc
    .array(fc.integer({ min: -maxAmount, max: maxAmount }), { minLength: 1, maxLength: maxPeople - 1 })
    .map((values) => {
      const balances: Record<string, number> = {};
      values.forEach((v, i) => (balances[`p${String(i).padStart(2, "0")}`] = v));
      balances.zz = -values.reduce((a, b) => a + b, 0);
      return balances;
    });

/** Balances built from a few small shared amounts, so zero-sum subgroups are common. */
const clusteredBalances = fc
  .array(fc.tuple(fc.integer({ min: 0, max: 7 }), fc.integer({ min: 0, max: 7 }), fc.constantFrom(100, 250, 500)), {
    maxLength: 12,
  })
  .map((debts) => {
    const balances: Record<string, number> = {};
    for (const [a, b, amount] of debts) {
      if (a === b) continue;
      balances[`m${a}`] = (balances[`m${a}`] ?? 0) - amount;
      balances[`m${b}`] = (balances[`m${b}`] ?? 0) + amount;
    }
    return balances;
  });

function expectValidPlan(balances: Record<string, number>, transfers: Transfer[]) {
  // Following the plan leaves everyone square.
  expect(Object.values(applyTransfers(balances, transfers)).every((v) => v === 0)).toBe(true);
  for (const t of transfers) {
    expect(Number.isSafeInteger(t.amount)).toBe(true);
    expect(t.amount).toBeGreaterThan(0);
    expect(t.from).not.toBe(t.to);
    // Money only flows from people who owe to people who are owed.
    expect(balances[t.from]).toBeLessThan(0);
    expect(balances[t.to]).toBeGreaterThan(0);
  }
}

describe("settleGreedy", () => {
  it("returns nothing when everyone is square", () => {
    expect(settleGreedy({})).toEqual([]);
    expect(settleGreedy({ a: 0, b: 0 })).toEqual([]);
  });

  it("settles a simple debt", () => {
    expect(settleGreedy({ alice: 500, bob: -500 })).toEqual([{ from: "bob", to: "alice", amount: 500 }]);
  });

  it("collapses a chain of debts into one payment", () => {
    // Bob owes Alice 10, Carol owes Bob 10: Carol can pay Alice directly.
    expect(settleGreedy({ alice: 1000, bob: 0, carol: -1000 })).toEqual([{ from: "carol", to: "alice", amount: 1000 }]);
  });

  it("matches the biggest debtor with the biggest creditor first", () => {
    expect(settleGreedy({ a: 7000, b: 3000, c: -6000, d: -4000 })).toEqual([
      { from: "c", to: "a", amount: 6000 },
      { from: "d", to: "b", amount: 3000 },
      { from: "d", to: "a", amount: 1000 },
    ]);
  });

  it("refuses balances that do not sum to zero", () => {
    expect(() => settleGreedy({ a: 100, b: -99 })).toThrow(/sum to zero/);
    expect(() => settleGreedy({ a: 0.5, b: -0.5 })).toThrow(/integer/);
  });

  it("produces a valid plan with at most n - 1 payments", () => {
    fc.assert(
      fc.property(zeroSumBalances(30), (balances) => {
        const plan = settleGreedy(balances);
        expectValidPlan(balances, plan);
        const nonZero = Object.values(balances).filter((v) => v !== 0).length;
        expect(plan.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      }),
    );
  });

  it("does not depend on the order of the input", () => {
    fc.assert(
      fc.property(zeroSumBalances(10), (balances) => {
        const reversed = Object.fromEntries(Object.entries(balances).reverse());
        expect(settleGreedy(reversed)).toEqual(settleGreedy(balances));
      }),
    );
  });
});

describe("settleExact", () => {
  it("spots a pair that cancels out, which greedy misses", () => {
    // Greedy starts with the biggest debtor (gus) and the biggest creditor and
    // needs 6 payments. The optimum notices that farah owes exactly what ben is
    // owed, settles that pair directly, and needs only 5.
    const balances = { alice: 400, ben: 600, chen: 500, dana: 600, eli: -100, farah: -600, gus: -1400 };
    expect(settleGreedy(balances)).toHaveLength(6);
    const exact = settleExact(balances);
    expect(exact).toHaveLength(5);
    expect(exact.length).toBe(bruteForceMinimum(balances));
    expectValidPlan(balances, exact);
  });

  it("returns nothing for settled groups", () => {
    expect(settleExact({ a: 0 })).toEqual([]);
  });

  it("is never worse than greedy and always valid", () => {
    fc.assert(
      fc.property(fc.oneof(zeroSumBalances(12, 2000), clusteredBalances), (balances) => {
        const exact = settleExact(balances);
        expectValidPlan(balances, exact);
        expect(exact.length).toBeLessThanOrEqual(settleGreedy(balances).length);
      }),
    );
  });

  it("matches a brute-force search for the true minimum", () => {
    fc.assert(
      fc.property(fc.oneof(zeroSumBalances(7, 30), clusteredBalances.filter((b) => Object.keys(b).length <= 8)), (balances) => {
        expect(settleExact(balances).length).toBe(bruteForceMinimum(balances));
      }),
      { numRuns: 300 },
    );
  });
});

describe("settleUp", () => {
  it("uses the exact solver for normal groups", () => {
    const balances = { alice: 400, ben: 600, chen: 500, dana: 600, eli: -100, farah: -600, gus: -1400 };
    expect(settleUp(balances)).toHaveLength(5);
  });

  it("falls back to greedy for very large groups", () => {
    const balances: Record<string, number> = {};
    for (let i = 0; i < 40; i++) balances[`p${String(i).padStart(2, "0")}`] = i % 2 === 0 ? 100 + i : -(100 + i - 1);
    balances.p39 = (balances.p39 ?? 0) - Object.values(balances).reduce((a, b) => a + b, 0);
    const plan = settleUp(balances);
    expect(plan).toEqual(settleGreedy(balances));
    expectValidPlan(balances, plan);
  });
});
