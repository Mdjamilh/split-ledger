import { describe, expect, it } from "vitest";

import { expenseInput, registerInput, settlementInput } from "../src/schemas";

const a = "00000000-0000-4000-8000-00000000000a";
const b = "00000000-0000-4000-8000-00000000000b";

const valid = {
  description: "Dinner",
  amount: 9000,
  currency: "USD",
  paidBy: a,
  occurredOn: "2026-10-20",
  method: "shares",
  entries: [
    { userId: a, value: 2 },
    { userId: b, value: 1 },
  ],
};

describe("expenseInput", () => {
  it("accepts a well-formed expense", () => {
    expect(expenseInput.safeParse(valid).success).toBe(true);
  });

  it("runs the split rules as part of validation", () => {
    const result = expenseInput.safeParse({ ...valid, method: "exact", entries: [{ userId: a, value: 100 }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["entries"]);
  });

  it("rejects unknown currencies, fractional amounts and bad dates", () => {
    expect(expenseInput.safeParse({ ...valid, currency: "XYZ" }).success).toBe(false);
    expect(expenseInput.safeParse({ ...valid, amount: 12.5 }).success).toBe(false);
    expect(expenseInput.safeParse({ ...valid, occurredOn: "20/10/2026" }).success).toBe(false);
  });
});

describe("registerInput", () => {
  it("normalises the email address", () => {
    const parsed = registerInput.parse({ email: "Ana@Example.COM", name: " Ana ", password: "long enough" });
    expect(parsed).toEqual({ email: "ana@example.com", name: "Ana", password: "long enough" });
  });

  it("requires a reasonable password", () => {
    expect(registerInput.safeParse({ email: "a@b.co", name: "A", password: "short" }).success).toBe(false);
  });
});

describe("settlementInput", () => {
  it("does not allow paying yourself", () => {
    expect(settlementInput.safeParse({ fromUserId: a, toUserId: a, amount: 100, currency: "USD" }).success).toBe(false);
    expect(settlementInput.safeParse({ fromUserId: a, toUserId: b, amount: 100, currency: "USD" }).success).toBe(true);
  });
});
