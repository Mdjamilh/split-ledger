/*
 * Fixed ids for the demo data. Every serverless instance seeds its own
 * in-memory database, and because the ids match, a signed session or a
 * /groups/<id> URL from one instance is valid on all of them.
 */
const id = (kind: string, n: number) => `5d1e0000-0000-4000-8000-${kind}${String(n).padStart(12 - kind.length, "0")}`;

export const DEMO_USER_ID = id("a", 1);
export const DEMO_EMAIL = "demo@split-ledger.app";

export const demoId = {
  user: (n: number) => id("a", n),
  group: (n: number) => id("b", n),
  expense: (n: number) => id("c", n),
  settlement: (n: number) => id("d", n),
};
