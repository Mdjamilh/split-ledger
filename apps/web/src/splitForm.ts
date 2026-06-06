import {
  allocate,
  computeShares,
  FULL_PERCENT_BP,
  parseAmount,
  toDecimalString,
  type Currency,
  type Expense,
  type SplitEntry,
  type SplitMethod,
} from "@split-ledger/shared";

/*
 * Turns what people type into the split editor into the API's entries, and
 * previews the result with the same computeShares the server runs, so the
 * preview and the saved expense can never disagree.
 */

export interface SplitDraft {
  method: SplitMethod;
  /** Who takes part in an equal split. */
  included: Record<string, boolean>;
  /** Raw text per person for exact / percentage / shares. */
  values: Record<string, string>;
}

/** "33.33" -> 3333 basis points; null for anything else. */
export function parsePercent(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bp <= FULL_PERCENT_BP ? bp : null;
}

export function formatPercent(bp: number): string {
  return bp % 100 === 0 ? String(bp / 100) : (bp / 100).toFixed(2).replace(/0$/, "");
}

export interface DraftResult {
  entries: SplitEntry[];
  /** Per-person input problems, keyed by user id. */
  invalid: Record<string, string>;
}

export function draftEntries(draft: SplitDraft, memberIds: string[], currency: Currency): DraftResult {
  const invalid: Record<string, string> = {};
  const entries: SplitEntry[] = [];
  for (const userId of memberIds) {
    if (draft.method === "equal") {
      if (draft.included[userId]) entries.push({ userId, value: 0 });
      continue;
    }
    const text = (draft.values[userId] ?? "").trim();
    if (text === "" || /^0+(\.0*)?$/.test(text)) continue;
    const value =
      draft.method === "exact" ? parseAmount(text, currency) : draft.method === "percentage" ? parsePercent(text) : /^\d{1,6}$/.test(text) ? Number(text) : null;
    if (value === null) {
      invalid[userId] =
        draft.method === "exact" ? "Not a valid amount" : draft.method === "percentage" ? "Use a number like 25 or 33.33" : "Use a whole number";
    } else {
      entries.push({ userId, value });
    }
  }
  return { entries, invalid };
}

export type Preview =
  | { kind: "empty" }
  | { kind: "error"; message: string; remaining?: string }
  | { kind: "ok"; shares: Map<string, number> };

/** What each person would pay, or why the split doesn't work yet. */
export function previewSplit(amount: number | null, draft: SplitDraft, memberIds: string[], currency: Currency): Preview {
  if (amount === null) return { kind: "empty" };
  const { entries, invalid } = draftEntries(draft, memberIds, currency);
  if (Object.keys(invalid).length > 0) return { kind: "error", message: "Fix the highlighted values." };
  if (entries.length === 0) return { kind: "error", message: "Pick at least one person to split with." };

  if (draft.method === "exact") {
    const left = amount - entries.reduce((a, e) => a + e.value, 0);
    if (left !== 0) {
      return {
        kind: "error",
        message: left > 0 ? "The amounts don't cover the total yet." : "The amounts add up to more than the total.",
        remaining: `${toDecimalString(Math.abs(left), currency)} ${left > 0 ? "left to assign" : "over"}`,
      };
    }
  }
  if (draft.method === "percentage") {
    const left = FULL_PERCENT_BP - entries.reduce((a, e) => a + e.value, 0);
    if (left !== 0) {
      return {
        kind: "error",
        message: "The percentages need to add up to 100%.",
        remaining: `${formatPercent(Math.abs(left))}% ${left > 0 ? "left" : "over"}`,
      };
    }
  }

  const result = computeShares(amount, draft.method, entries);
  if (!result.ok) return { kind: "error", message: result.error };
  return { kind: "ok", shares: new Map(result.shares.map((s) => [s.userId, s.amount])) };
}

/** Rebuilds the editor state from a saved expense, for editing. */
export function draftFromExpense(expense: Expense, memberIds: string[]): SplitDraft {
  const included: Record<string, boolean> = Object.fromEntries(memberIds.map((id) => [id, false]));
  const values: Record<string, string> = {};
  for (const share of expense.shares) {
    included[share.userId] = true;
    values[share.userId] =
      expense.method === "exact"
        ? toDecimalString(share.value, expense.currency)
        : expense.method === "percentage"
          ? formatPercent(share.value)
          : String(share.value);
  }
  return { method: expense.method, included, values };
}

/**
 * Switching method keeps who is involved and pre-fills sensible values:
 * one share each, or an even percentage split that adds up to exactly 100.
 */
export function switchMethod(draft: SplitDraft, method: SplitMethod, memberIds: string[]): SplitDraft {
  const involved = memberIds.filter((id) => draft.included[id]);
  const people = involved.length > 0 ? involved : memberIds;
  if (method === "shares") return { ...draft, method, values: Object.fromEntries(people.map((id) => [id, "1"])) };
  if (method === "percentage") {
    const bp = allocate(FULL_PERCENT_BP, people.map(() => 1));
    return { ...draft, method, values: Object.fromEntries(people.map((id, i) => [id, formatPercent(bp[i]!)])) };
  }
  if (method === "exact") return { ...draft, method, values: {} };
  return { ...draft, method };
}
