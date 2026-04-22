import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { allocate, computeShares, type SplitEntry } from "../src/split";

const people = (...values: number[]): SplitEntry[] => values.map((value, i) => ({ userId: `u${i + 1}`, value }));
const amounts = (r: ReturnType<typeof computeShares>) => (r.ok ? r.shares.map((s) => s.amount) : r.error);

describe("allocate", () => {
  it("splits evenly when it can", () => {
    expect(allocate(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it("hands leftover minor units to the earliest entries", () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it("gives leftovers to the largest remainders first", () => {
    // Exact shares: 1.666.., 3.333.. -> the second has the bigger remainder.
    expect(allocate(5, [1, 2])).toEqual([2, 3]);
  });

  it("stays exact for large totals and weights", () => {
    const total = 999_999_999_999;
    const parts = allocate(total, [3333, 3333, 3334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("rejects bad input", () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
    expect(() => allocate(100, [1.5])).toThrow();
  });

  it("always sums to the total and stays within one unit of the exact share", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 20 }).filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const parts = allocate(total, weights);
          const sum = weights.reduce((a, b) => a + b, 0);
          expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
          parts.forEach((p, i) => {
            const exact = (total * weights[i]!) / sum;
            expect(Number.isInteger(p)).toBe(true);
            expect(Math.abs(p - exact)).toBeLessThan(1 + 1e-6);
            if (weights[i] === 0) expect(p).toBe(0);
          });
        },
      ),
    );
  });
});

describe("computeShares", () => {
  it("equal: everyone pays the same, give or take a cent", () => {
    expect(amounts(computeShares(10000, "equal", people(0, 0, 0)))).toEqual([3334, 3333, 3333]);
  });

  it("exact: uses the amounts as given when they add up", () => {
    expect(amounts(computeShares(5000, "exact", people(1000, 4000)))).toEqual([1000, 4000]);
    expect(computeShares(5000, "exact", people(1000, 3999))).toMatchObject({ ok: false });
  });

  it("percentage: works in basis points and must total 100%", () => {
    expect(amounts(computeShares(10000, "percentage", people(5000, 3000, 2000)))).toEqual([5000, 3000, 2000]);
    expect(amounts(computeShares(100, "percentage", people(3333, 3333, 3334)))).toEqual([33, 33, 34]);
    const bad = computeShares(10000, "percentage", people(5000, 4000));
    expect(bad).toEqual({ ok: false, error: "The percentages add up to 90%, not 100%." });
  });

  it("shares: splits by weight", () => {
    expect(amounts(computeShares(9000, "shares", people(2, 1)))).toEqual([6000, 3000]);
    expect(amounts(computeShares(9000, "shares", people(1, 0, 2)))).toEqual([3000, 0, 6000]);
    expect(computeShares(9000, "shares", people(0, 0))).toMatchObject({ ok: false });
  });

  it("rejects empty, duplicate and negative entries", () => {
    expect(computeShares(100, "equal", [])).toMatchObject({ ok: false });
    expect(computeShares(0, "equal", people(0))).toMatchObject({ ok: false });
    expect(
      computeShares(100, "equal", [
        { userId: "a", value: 0 },
        { userId: "a", value: 0 },
      ]),
    ).toMatchObject({ ok: false });
    expect(computeShares(100, "shares", people(-1, 2))).toMatchObject({ ok: false });
  });

  it("successful splits always add up to the expense total", () => {
    const method = fc.constantFrom("equal" as const, "percentage" as const, "shares" as const);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), method, fc.integer({ min: 1, max: 12 }), (total, m, n) => {
        const values =
          m === "percentage" ? allocate(10_000, Array.from({ length: n }, () => 1)) : Array.from({ length: n }, (_, i) => i + 1);
        const result = computeShares(total, m, people(...values));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.shares.reduce((a, s) => a + s.amount, 0)).toBe(total);
      }),
    );
  });
});
