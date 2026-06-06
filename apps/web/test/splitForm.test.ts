import { describe, expect, it } from "vitest";

import { draftEntries, draftFromExpense, formatPercent, parsePercent, previewSplit, switchMethod, type SplitDraft } from "../src/splitForm";

const ids = ["a", "b", "c"];
const draft = (method: SplitDraft["method"], values: Record<string, string> = {}, included: Record<string, boolean> = {}): SplitDraft => ({
  method,
  values,
  included,
});

describe("parsePercent", () => {
  it("reads whole and two-decimal percentages as basis points", () => {
    expect(parsePercent("25")).toBe(2500);
    expect(parsePercent("33.33")).toBe(3333);
    expect(parsePercent("12.5")).toBe(1250);
    expect(parsePercent("100")).toBe(10000);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "101", "1.234", "-5", "5%"]) expect(parsePercent(bad), bad).toBeNull();
  });

  it("formats basis points back", () => {
    expect(formatPercent(2500)).toBe("25");
    expect(formatPercent(3333)).toBe("33.33");
    expect(formatPercent(1250)).toBe("12.5");
  });
});

describe("draftEntries", () => {
  it("includes only ticked people for an equal split", () => {
    expect(draftEntries(draft("equal", {}, { a: true, c: true }), ids, "USD").entries).toEqual([
      { userId: "a", value: 0 },
      { userId: "c", value: 0 },
    ]);
  });

  it("skips blank and zero values, and flags bad ones", () => {
    const result = draftEntries(draft("exact", { a: "10.50", b: "0", c: "ten" }), ids, "USD");
    expect(result.entries).toEqual([{ userId: "a", value: 1050 }]);
    expect(result.invalid).toEqual({ c: "Not a valid amount" });
  });
});

describe("previewSplit", () => {
  it("previews an equal split with the cent going to the first person", () => {
    const preview = previewSplit(1000, draft("equal", {}, { a: true, b: true, c: true }), ids, "USD");
    expect(preview).toEqual({ kind: "ok", shares: new Map([["a", 334], ["b", 333], ["c", 333]]) });
  });

  it("says how much is left to assign for exact amounts", () => {
    const preview = previewSplit(5000, draft("exact", { a: "20", b: "10" }), ids, "USD");
    expect(preview).toMatchObject({ kind: "error", remaining: "20.00 left to assign" });
    expect(previewSplit(5000, draft("exact", { a: "40", b: "20" }), ids, "USD")).toMatchObject({ remaining: "10.00 over" });
  });

  it("says how far percentages are from 100%", () => {
    expect(previewSplit(5000, draft("percentage", { a: "50", b: "25" }), ids, "USD")).toMatchObject({ remaining: "25% left" });
  });

  it("splits by shares", () => {
    const preview = previewSplit(9000, draft("shares", { a: "2", c: "1" }), ids, "USD");
    expect(preview).toEqual({ kind: "ok", shares: new Map([["a", 6000], ["c", 3000]]) });
  });

  it("waits for an amount", () => {
    expect(previewSplit(null, draft("equal", {}, { a: true }), ids, "USD")).toEqual({ kind: "empty" });
  });
});

describe("draftFromExpense", () => {
  it("restores the values people typed", () => {
    const restored = draftFromExpense(
      {
        id: "x",
        description: "d",
        amount: 1000,
        currency: "EUR",
        paidBy: "a",
        method: "percentage",
        occurredOn: "2026-10-01",
        createdAt: "",
        createdBy: "a",
        shares: [
          { userId: "a", amount: 333, value: 3333 },
          { userId: "b", amount: 667, value: 6667 },
        ],
      },
      ids,
    );
    expect(restored).toEqual({ method: "percentage", included: { a: true, b: true, c: false }, values: { a: "33.33", b: "66.67" } });
  });
});

describe("switchMethod", () => {
  const equal = draft("equal", {}, { a: true, b: true, c: true });

  it("gives everyone involved one share", () => {
    expect(switchMethod(equal, "shares", ids).values).toEqual({ a: "1", b: "1", c: "1" });
  });

  it("pre-fills percentages that add up to exactly 100", () => {
    const next = switchMethod(equal, "percentage", ids);
    expect(next.values).toEqual({ a: "33.34", b: "33.33", c: "33.33" });
    expect(previewSplit(1000, next, ids, "USD").kind).toBe("ok");
  });

  it("only includes people who were ticked", () => {
    expect(switchMethod(draft("equal", {}, { b: true }), "shares", ids).values).toEqual({ b: "1" });
  });
});
