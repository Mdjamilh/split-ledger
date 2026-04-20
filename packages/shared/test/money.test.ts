import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CURRENCY_CODES, formatMoney, parseAmount, toDecimalString } from "../src/money";

describe("parseAmount", () => {
  it("parses whole and fractional amounts into minor units", () => {
    expect(parseAmount("12", "USD")).toBe(1200);
    expect(parseAmount("12.5", "USD")).toBe(1250);
    expect(parseAmount("12.34", "USD")).toBe(1234);
    expect(parseAmount("0.01", "USD")).toBe(1);
    expect(parseAmount(" 1,234.56 ", "EUR")).toBe(123456);
  });

  it("respects each currency's number of decimals", () => {
    expect(parseAmount("1500", "JPY")).toBe(1500);
    expect(parseAmount("15.5", "JPY")).toBeNull();
    expect(parseAmount("1.234", "KWD")).toBe(1234);
    expect(parseAmount("1.234", "USD")).toBeNull();
  });

  it("does not suffer from floating point rounding", () => {
    // 0.29 * 100 is 28.999999999999996 in floating point.
    expect(parseAmount("0.29", "USD")).toBe(29);
    expect(parseAmount("1.15", "USD")).toBe(115);
  });

  it("rejects zero, negatives and junk", () => {
    for (const bad of ["", "0", "0.00", "-5", "abc", "1.2.3", "1e5", ".", "12."]) {
      expect(parseAmount(bad, "USD"), bad).toBeNull();
    }
  });

  it("rejects absurdly large amounts", () => {
    expect(parseAmount("99999999999999", "USD")).toBeNull();
  });
});

describe("toDecimalString", () => {
  it("formats minor units as a plain decimal", () => {
    expect(toDecimalString(1234, "USD")).toBe("12.34");
    expect(toDecimalString(5, "USD")).toBe("0.05");
    expect(toDecimalString(-250, "EUR")).toBe("-2.50");
    expect(toDecimalString(1500, "JPY")).toBe("1500");
    expect(toDecimalString(1, "KWD")).toBe("0.001");
  });

  it("round-trips with parseAmount for every currency", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CURRENCY_CODES), fc.integer({ min: 1, max: 1_000_000_000 }), (currency, minor) => {
        expect(parseAmount(toDecimalString(minor, currency), currency)).toBe(minor);
      }),
    );
  });
});

describe("formatMoney", () => {
  it("uses the currency symbol and its decimals", () => {
    expect(formatMoney(1234, "USD")).toBe("$12.34");
    expect(formatMoney(1500, "JPY")).toBe("¥1,500");
    expect(formatMoney(-500, "GBP")).toBe("-£5.00");
  });
});
