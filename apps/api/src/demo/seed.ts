import { randomBytes } from "node:crypto";

import { computeShares, formatMoney, type Currency, type SplitMethod } from "@split-ledger/shared";
import { eq } from "drizzle-orm";

import { hashPassword } from "../auth/password";
import { schema, type Db } from "../db";
import { DEMO_EMAIL, DEMO_USER_ID, demoId } from "./ids";

/*
 * Sample data for the public demo: three groups with a mix of split methods
 * and currencies, a recorded payment and an activity history. Dates are
 * relative to today so the demo never looks stale.
 */

export const DEMO_PASSWORD = "demo-password";

const people = {
  alex: { id: DEMO_USER_ID, name: "Alex Rivera", email: DEMO_EMAIL },
  maya: { id: demoId.user(2), name: "Maya Chen", email: "maya@demo.split-ledger.app" },
  omar: { id: demoId.user(3), name: "Omar Haddad", email: "omar@demo.split-ledger.app" },
  lena: { id: demoId.user(4), name: "Lena Fischer", email: "lena@demo.split-ledger.app" },
  theo: { id: demoId.user(5), name: "Theo Brooks", email: "theo@demo.split-ledger.app" },
};
type Person = keyof typeof people;

interface SeedExpense {
  description: string;
  amount: number;
  currency: Currency;
  paidBy: Person;
  method: SplitMethod;
  split: [Person, number][];
  daysAgo: number;
}

interface SeedGroup {
  name: string;
  currency: Currency;
  members: Person[];
  daysAgo: number;
  expenses: SeedExpense[];
  settlements: { from: Person; to: Person; amount: number; currency: Currency; daysAgo: number }[];
}

const everyone = (...who: Person[]): [Person, number][] => who.map((p) => [p, 0]);

const groups: SeedGroup[] = [
  {
    name: "Lisbon long weekend",
    currency: "EUR",
    members: ["alex", "maya", "omar", "lena"],
    daysAgo: 21,
    expenses: [
      { description: "Apartment in Alfama, 3 nights", amount: 48000, currency: "EUR", paidBy: "alex", method: "equal", split: everyone("alex", "maya", "omar", "lena"), daysAgo: 20 },
      { description: "Seafood dinner at the harbour", amount: 18640, currency: "EUR", paidBy: "maya", method: "shares", split: [["alex", 1], ["maya", 1], ["omar", 2], ["lena", 1]], daysAgo: 19 },
      { description: "Tram and metro passes", amount: 3800, currency: "EUR", paidBy: "omar", method: "equal", split: everyone("alex", "maya", "omar", "lena"), daysAgo: 19 },
      { description: "Sintra palace tickets", amount: 9600, currency: "EUR", paidBy: "lena", method: "exact", split: [["alex", 2400], ["maya", 2400], ["omar", 2400], ["lena", 2400]], daysAgo: 18 },
      { description: "Fado show (booked in USD)", amount: 12000, currency: "USD", paidBy: "omar", method: "equal", split: everyone("alex", "maya", "omar"), daysAgo: 18 },
      { description: "Airport taxi", amount: 4250, currency: "EUR", paidBy: "alex", method: "percentage", split: [["alex", 3000], ["maya", 3000], ["lena", 4000]], daysAgo: 17 },
      { description: "Pasteis de nata and coffee", amount: 1760, currency: "EUR", paidBy: "maya", method: "equal", split: everyone("alex", "maya", "omar", "lena"), daysAgo: 17 },
    ],
    settlements: [{ from: "lena", to: "alex", amount: 5000, currency: "EUR", daysAgo: 12 }],
  },
  {
    name: "Flat 4B",
    currency: "USD",
    members: ["alex", "theo", "maya"],
    daysAgo: 60,
    expenses: [
      { description: "Electricity, September", amount: 8845, currency: "USD", paidBy: "theo", method: "percentage", split: [["alex", 4000], ["theo", 3500], ["maya", 2500]], daysAgo: 24 },
      { description: "Internet, October", amount: 6499, currency: "USD", paidBy: "alex", method: "equal", split: everyone("alex", "theo", "maya"), daysAgo: 15 },
      { description: "Big grocery run", amount: 14237, currency: "USD", paidBy: "maya", method: "shares", split: [["alex", 2], ["theo", 2], ["maya", 1]], daysAgo: 9 },
      { description: "Cleaning supplies", amount: 2310, currency: "USD", paidBy: "theo", method: "equal", split: everyone("alex", "theo", "maya"), daysAgo: 4 },
    ],
    settlements: [],
  },
  {
    name: "Friday board games",
    currency: "GBP",
    members: ["alex", "omar", "theo", "lena"],
    daysAgo: 40,
    expenses: [
      { description: "Pizza for game night", amount: 5400, currency: "GBP", paidBy: "omar", method: "equal", split: everyone("alex", "omar", "theo", "lena"), daysAgo: 7 },
      { description: "New game: Cascadia", amount: 3599, currency: "GBP", paidBy: "alex", method: "equal", split: everyone("alex", "omar", "theo", "lena"), daysAgo: 7 },
      { description: "Snacks and drinks", amount: 1875, currency: "GBP", paidBy: "lena", method: "equal", split: everyone("omar", "theo", "lena"), daysAgo: 2 },
    ],
    settlements: [],
  },
];

const DAY = 24 * 60 * 60 * 1000;

/** Inserts the demo data once; later calls find the demo user and return. */
export async function seedDemo(db: Db, now = new Date()): Promise<void> {
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, DEMO_USER_ID));
  if (existing) return;

  const at = (daysAgo: number, minutes = 0) => new Date(now.getTime() - daysAgo * DAY + minutes * 60_000);
  const day = (daysAgo: number) => at(daysAgo).toISOString().slice(0, 10);
  const demoHash = await hashPassword(DEMO_PASSWORD);
  // The friends can't sign in: their passwords are random and never shown.
  const lockedHash = await hashPassword(randomBytes(24).toString("hex"));

  await db.transaction(async (tx) => {
    await tx.insert(schema.users).values(
      Object.values(people).map((p) => ({ ...p, passwordHash: p.id === DEMO_USER_ID ? demoHash : lockedHash, createdAt: at(90) })),
    );

    let expenseNo = 0;
    let settlementNo = 0;
    for (const [index, g] of groups.entries()) {
      const groupId = demoId.group(index + 1);
      await tx.insert(schema.groups).values({ id: groupId, name: g.name, currency: g.currency, createdBy: people.alex.id, createdAt: at(g.daysAgo) });
      await tx.insert(schema.memberships).values(
        g.members.map((m, i) => ({ groupId, userId: people[m].id, role: i === 0 ? ("owner" as const) : ("member" as const), joinedAt: at(g.daysAgo, i) })),
      );
      const log: (typeof schema.activity.$inferInsert)[] = [
        { groupId, actorId: people.alex.id, kind: "group.created", summary: `created the group "${g.name}"`, createdAt: at(g.daysAgo) },
        ...g.members.slice(1).map((m, i) => ({
          groupId,
          actorId: people[m].id,
          kind: "member.joined",
          summary: "joined the group",
          createdAt: at(g.daysAgo, i + 1),
        })),
      ];

      for (const e of g.expenses) {
        const id = demoId.expense(++expenseNo);
        const split = computeShares(
          e.amount,
          e.method,
          e.split.map(([p, value]) => ({ userId: people[p].id, value })),
        );
        if (!split.ok) throw new Error(`Bad demo expense "${e.description}": ${split.error}`);
        const createdAt = at(e.daysAgo, 600);
        await tx.insert(schema.expenses).values({
          id,
          groupId,
          description: e.description,
          amount: e.amount,
          currency: e.currency,
          paidBy: people[e.paidBy].id,
          method: e.method,
          occurredOn: day(e.daysAgo),
          createdBy: people[e.paidBy].id,
          createdAt,
        });
        await tx.insert(schema.expenseShares).values(
          split.shares.map((s, position) => ({ expenseId: id, userId: s.userId, amount: s.amount, value: e.split[position]![1], position })),
        );
        log.push({
          groupId,
          actorId: people[e.paidBy].id,
          kind: "expense.added",
          summary: `added "${e.description}" (${formatMoney(e.amount, e.currency)})`,
          data: { expenseId: id },
          createdAt,
        });
      }

      for (const s of g.settlements) {
        const id = demoId.settlement(++settlementNo);
        const createdAt = at(s.daysAgo, 720);
        await tx.insert(schema.settlements).values({
          id,
          groupId,
          fromUserId: people[s.from].id,
          toUserId: people[s.to].id,
          amount: s.amount,
          currency: s.currency,
          createdBy: people[s.from].id,
          createdAt,
        });
        log.push({
          groupId,
          actorId: people[s.from].id,
          kind: "settlement.recorded",
          summary: `recorded ${people[s.from].name} paying ${people[s.to].name} ${formatMoney(s.amount, s.currency)}`,
          data: { settlementId: id },
          createdAt,
        });
      }
      await tx.insert(schema.activity).values(log);
    }
  });
}
