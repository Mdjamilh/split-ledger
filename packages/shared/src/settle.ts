/*
 * Settle up: given everyone's net balance in one currency, produce a list of
 * payments that brings every balance to zero using as few payments as we can.
 *
 * Two strategies:
 *
 * 1. Greedy. Repeatedly match the person who is owed the most with the person
 *    who owes the most and move the smaller of the two amounts. Every payment
 *    clears at least one person and the last one clears two, so n people with
 *    a non-zero balance never need more than n - 1 payments. O(n^2), any n.
 *
 * 2. Exact. Finding the true minimum is NP-hard in general, but it has a neat
 *    structure: if the people can be split into k groups that each sum to
 *    zero, every group can settle internally with (size - 1) payments, so the
 *    minimum is n - k where k is the largest such partition. A dynamic
 *    program over subsets finds k in O(2^n * n), which is instant for the
 *    group sizes this app sees. Within each zero-sum group we run the greedy
 *    pass, which never needs more than (size - 1) payments.
 *
 * `settleUp` uses the exact strategy up to EXACT_LIMIT people and falls back
 * to greedy above that.
 */

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Above this many non-zero balances the subset DP gets expensive; use greedy. */
export const EXACT_LIMIT = 16;

interface Entry {
  id: string;
  amount: number;
}

function nonZeroEntries(balances: Readonly<Record<string, number>>): Entry[] {
  let sum = 0;
  const entries: Entry[] = [];
  for (const [id, amount] of Object.entries(balances)) {
    if (!Number.isSafeInteger(amount)) throw new RangeError(`Balance for ${id} is not an integer`);
    sum += amount;
    if (amount !== 0) entries.push({ id, amount });
  }
  if (sum !== 0) throw new RangeError(`Balances must sum to zero, got ${sum}`);
  // Sorting by id makes the output independent of the input's key order.
  return entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function greedyEntries(entries: readonly Entry[]): Transfer[] {
  const creditors = entries.filter((e) => e.amount > 0).map((e) => ({ ...e }));
  const debtors = entries.filter((e) => e.amount < 0).map((e) => ({ id: e.id, amount: -e.amount }));
  const transfers: Transfer[] = [];

  const largest = (list: Entry[]) => {
    let best: Entry | undefined;
    for (const e of list) if (e.amount > 0 && (!best || e.amount > best.amount)) best = e;
    return best;
  };

  for (;;) {
    const creditor = largest(creditors);
    const debtor = largest(debtors);
    if (!creditor || !debtor) break;
    const amount = Math.min(creditor.amount, debtor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
  }
  return transfers;
}

/** Greedy largest-creditor / largest-debtor matching. At most n - 1 transfers. */
export function settleGreedy(balances: Readonly<Record<string, number>>): Transfer[] {
  return greedyEntries(nonZeroEntries(balances));
}

/**
 * Splits entries into the largest possible number of zero-sum groups.
 * dp[mask] is the best number of zero-sum "cut points" over orderings of the
 * people in mask; walking the choices back gives an ordering whose zero
 * prefix sums mark the group boundaries.
 */
function zeroSumGroups(entries: readonly Entry[]): Entry[][] {
  const n = entries.length;
  const size = 1 << n;
  const sum = new Float64Array(size);
  const dp = new Int8Array(size);
  const choice = new Int8Array(size);

  for (let mask = 1; mask < size; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    sum[mask] = sum[mask & (mask - 1)]! + entries[low]!.amount;
    let best = -1;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i) && dp[mask ^ (1 << i)]! > best) {
        best = dp[mask ^ (1 << i)]!;
        pick = i;
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
    choice[mask] = pick;
  }

  // Rebuild the ordering back to front, then cut it wherever the prefix sum is zero.
  const order: Entry[] = [];
  for (let mask = size - 1; mask; mask ^= 1 << choice[mask]!) order.push(entries[choice[mask]!]!);
  order.reverse();

  const groups: Entry[][] = [];
  let current: Entry[] = [];
  let running = 0;
  for (const e of order) {
    current.push(e);
    running += e.amount;
    if (running === 0) {
      groups.push(current);
      current = [];
    }
  }
  return groups;
}

/** Minimum number of transfers, found exactly. Use only for small inputs. */
export function settleExact(balances: Readonly<Record<string, number>>): Transfer[] {
  const entries = nonZeroEntries(balances);
  if (entries.length > EXACT_LIMIT + 4) throw new RangeError("Too many balances for the exact solver");
  if (entries.length === 0) return [];
  return zeroSumGroups(entries).flatMap((group) =>
    greedyEntries([...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))),
  );
}

/** The plan the app shows: exact for normal group sizes, greedy beyond that. */
export function settleUp(balances: Readonly<Record<string, number>>): Transfer[] {
  const nonZero = Object.values(balances).filter((v) => v !== 0).length;
  return nonZero <= EXACT_LIMIT ? settleExact(balances) : settleGreedy(balances);
}

/** Applies transfers to balances; settling correctly leaves every value at zero. */
export function applyTransfers(
  balances: Readonly<Record<string, number>>,
  transfers: readonly Transfer[],
): Record<string, number> {
  const next = { ...balances };
  for (const t of transfers) {
    next[t.from] = (next[t.from] ?? 0) + t.amount;
    next[t.to] = (next[t.to] ?? 0) - t.amount;
  }
  return next;
}
