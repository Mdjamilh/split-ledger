/*
 * Turning one expense into per-person shares.
 *
 * Every method ends in the same place: a list of integer minor-unit amounts
 * that add up to exactly the expense total. Proportional methods use the
 * largest remainder method, so nobody's share is off by more than one minor
 * unit from their exact proportion and no cent is ever lost or invented.
 */

export const SPLIT_METHODS = ["equal", "exact", "percentage", "shares"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/**
 * One participant in a split. What `value` means depends on the method:
 * - equal: ignored (everyone listed takes part)
 * - exact: the participant's amount in minor units
 * - percentage: basis points, so 10000 is 100% and 3333 is 33.33%
 * - shares: a whole-number weight, e.g. 2 for someone who had two portions
 */
export interface SplitEntry {
  userId: string;
  value: number;
}

export interface Share {
  userId: string;
  amount: number;
}

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

/** 100% expressed in basis points. */
export const FULL_PERCENT_BP = 10_000;

/**
 * Splits `total` into integer parts proportional to `weights` (largest
 * remainder method). Ties in the remainder go to the earlier entry, which
 * keeps the result deterministic. BigInt keeps total * weight exact.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("total must be a non-negative safe integer");
  if (weights.length === 0) throw new RangeError("at least one weight is required");
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new RangeError("weights must be non-negative integers");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new RangeError("weights must not all be zero");

  const bigTotal = BigInt(total);
  const bigSum = BigInt(sum);
  const parts = weights.map((w) => {
    const exact = bigTotal * BigInt(w);
    return { base: exact / bigSum, remainder: exact % bigSum };
  });

  let left = total - parts.reduce((acc, p) => acc + Number(p.base), 0);
  const order = parts
    .map((p, index) => ({ index, remainder: p.remainder }))
    .sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));

  const result = parts.map((p) => Number(p.base));
  for (const { index } of order) {
    if (left === 0) break;
    result[index]! += 1;
    left -= 1;
  }
  return result;
}

/** Computes each participant's share of `total` for the given method. */
export function computeShares(total: number, method: SplitMethod, entries: readonly SplitEntry[]): SplitResult {
  if (!Number.isSafeInteger(total) || total <= 0) return { ok: false, error: "The amount must be greater than zero." };
  if (entries.length === 0) return { ok: false, error: "Pick at least one person to split with." };
  const ids = new Set(entries.map((e) => e.userId));
  if (ids.size !== entries.length) return { ok: false, error: "Each person can appear only once in a split." };
  if (entries.some((e) => !Number.isSafeInteger(e.value) || e.value < 0)) {
    return { ok: false, error: "Split values must be whole, non-negative numbers." };
  }

  const zip = (amounts: number[]): SplitResult => ({
    ok: true,
    shares: entries.map((e, i) => ({ userId: e.userId, amount: amounts[i]! })),
  });

  switch (method) {
    case "equal":
      return zip(allocate(total, entries.map(() => 1)));

    case "exact": {
      const sum = entries.reduce((acc, e) => acc + e.value, 0);
      if (sum !== total) {
        return { ok: false, error: `The amounts add up to ${sum} but the expense is ${total} (minor units).` };
      }
      return zip(entries.map((e) => e.value));
    }

    case "percentage": {
      const sum = entries.reduce((acc, e) => acc + e.value, 0);
      if (sum !== FULL_PERCENT_BP) {
        return { ok: false, error: `The percentages add up to ${sum / 100}%, not 100%.` };
      }
      return zip(allocate(total, entries.map((e) => e.value)));
    }

    case "shares": {
      if (entries.every((e) => e.value === 0)) return { ok: false, error: "At least one person needs a share." };
      return zip(allocate(total, entries.map((e) => e.value)));
    }
  }
}
