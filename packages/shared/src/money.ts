/*
 * Money is always an integer count of the currency's minor unit (cents for
 * USD, yen for JPY, fils for KWD). Floats never touch an amount: user input
 * is parsed from its decimal string and output is formatted from the integer.
 */

/** Supported currencies and how many decimal places their minor unit has. */
export const CURRENCIES = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  BDT: 2,
  INR: 2,
  CAD: 2,
  AUD: 2,
  JPY: 0,
  KWD: 3,
} as const;

export type Currency = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as [Currency, ...Currency[]];

export function isCurrency(code: string): code is Currency {
  return Object.hasOwn(CURRENCIES, code);
}

export function minorDigits(currency: Currency): number {
  return CURRENCIES[currency];
}

/** Largest amount accepted anywhere: comfortably inside a Postgres bigint and a JS safe integer. */
export const MAX_MINOR = 1_000_000_000_000;

/**
 * Parses a user-typed amount ("12", "12.5", "1,234.56") into minor units.
 * Returns null for anything that is not a positive amount with at most the
 * currency's number of decimals.
 */
export function parseAmount(input: string, currency: Currency): number | null {
  const digits = minorDigits(currency);
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_MINOR) return null;
  return minor;
}

/** Plain decimal string for a minor amount, e.g. 1234 USD -> "12.34". Used for inputs and CSV. */
export function toDecimalString(minor: number, currency: Currency): string {
  const digits = minorDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  if (digits === 0) return `${sign}${abs}`;
  const unit = 10 ** digits;
  const whole = Math.floor(abs / unit);
  const fraction = String(abs % unit).padStart(digits, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Localised display string, e.g. 1234 USD -> "$12.34". */
export function formatMoney(minor: number, currency: Currency, locale = "en-US"): string {
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}
