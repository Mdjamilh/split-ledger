import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, createGroup, expense, join, startApp, type TestApp } from "./harness";

let t: TestApp;
let ana: Client;
let ben: Client;
let cy: Client;
let groupId: string;
const url = (path = "") => `/api/groups/${groupId}${path}`;

beforeAll(async () => {
  t = await startApp();
  ana = await Client.register(t.app, "Ana");
  ben = await Client.register(t.app, "Ben");
  cy = await Client.register(t.app, "Cy");
  groupId = await createGroup(ana, "Lisbon", "EUR");
  await join(ana, groupId, ben, cy);
});
afterAll(() => t.close());

describe("group detail", () => {
  it("lists members with the creator as owner", async () => {
    const detail = (await ben.get(url())).json();
    expect(detail).toMatchObject({ name: "Lisbon", currency: "EUR" });
    expect(detail.members.map((m: { name: string; role: string }) => [m.name, m.role])).toEqual([
      ["Ana", "owner"],
      ["Ben", "member"],
      ["Cy", "member"],
    ]);
  });
});

describe("expenses", () => {
  it("stores each split method and returns the computed shares", async () => {
    const all = [ana.id, ben.id, cy.id];
    const equal = await ana.post(url("/expenses"), expense(ana.id, 10000, all, { currency: "EUR", description: "Hotel" }));
    expect(equal.statusCode).toBe(201);
    await ben.post(
      url("/expenses"),
      expense(ben.id, 6000, [], {
        currency: "EUR",
        description: "Dinner",
        method: "shares",
        entries: [
          { userId: ana.id, value: 1 },
          { userId: ben.id, value: 1 },
          { userId: cy.id, value: 2 },
        ],
      }),
    );
    await cy.post(
      url("/expenses"),
      expense(cy.id, 2000, [], {
        currency: "USD",
        description: "Museum",
        method: "percentage",
        entries: [
          { userId: ana.id, value: 5000 },
          { userId: cy.id, value: 5000 },
        ],
      }),
    );

    const list = (await ana.get(url("/expenses"))).json();
    expect(list).toHaveLength(3);
    const hotel = list.find((e: { description: string }) => e.description === "Hotel");
    expect(hotel.shares.map((s: { amount: number }) => s.amount)).toEqual([3334, 3333, 3333]);
    const dinner = list.find((e: { description: string }) => e.description === "Dinner");
    expect(dinner.shares).toEqual([
      { userId: ana.id, amount: 1500, value: 1 },
      { userId: ben.id, amount: 1500, value: 1 },
      { userId: cy.id, amount: 3000, value: 2 },
    ]);
  });

  it("rejects splits that don't add up", async () => {
    const res = await ana.post(
      url("/expenses"),
      expense(ana.id, 5000, [], { method: "exact", entries: [{ userId: ana.id, value: 4000 }] }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe("entries");
  });

  it("updates and deletes an expense", async () => {
    const id = (await ana.post(url("/expenses"), expense(ana.id, 999, [ana.id, ben.id], { currency: "EUR", description: "Taxi" }))).json().id;
    const updated = await ben.put(url(`/expenses/${id}`), expense(ben.id, 1200, [ana.id, ben.id], { currency: "EUR", description: "Taxi home" }));
    expect(updated.statusCode).toBe(200);
    const taxi = (await ana.get(url("/expenses"))).json().find((e: { id: string }) => e.id === id);
    expect(taxi).toMatchObject({ description: "Taxi home", amount: 1200, paidBy: ben.id });
    expect(taxi.shares.map((s: { amount: number }) => s.amount)).toEqual([600, 600]);

    expect((await cy.del(url(`/expenses/${id}`))).statusCode).toBe(204);
    expect((await ana.get(url("/expenses"))).json().some((e: { id: string }) => e.id === id)).toBe(false);
  });
});

describe("balances and settling up", () => {
  it("keeps one ledger per currency, group currency first", async () => {
    const { ledgers } = (await ana.get(url("/balances"))).json();
    expect(ledgers.map((l: { currency: string }) => l.currency)).toEqual(["EUR", "USD"]);
    const eur = Object.fromEntries(ledgers[0].balances.map((b: { userId: string; net: number }) => [b.userId, b.net]));
    // Hotel: Ana paid 100.00, shares 33.34/33.33/33.33. Dinner: Ben paid 60.00, shares 15/15/30.
    expect(eur).toEqual({ [ana.id]: 10000 - 3334 - 1500, [ben.id]: 6000 - 3333 - 1500, [cy.id]: -3333 - 3000 });
    const usd = Object.fromEntries(ledgers[1].balances.map((b: { userId: string; net: number }) => [b.userId, b.net]));
    expect(usd).toEqual({ [ana.id]: -1000, [ben.id]: 0, [cy.id]: 1000 });
  });

  it("suggests a plan, and recording it settles the group", async () => {
    const { ledgers } = (await ana.get(url("/balances"))).json();
    for (const ledger of ledgers) {
      for (const step of ledger.plan) {
        const res = await ben.post(url("/settlements"), {
          fromUserId: step.from,
          toUserId: step.to,
          amount: step.amount,
          currency: ledger.currency,
        });
        expect(res.statusCode).toBe(201);
      }
    }
    const after = (await ana.get(url("/balances"))).json();
    for (const ledger of after.ledgers) {
      expect(ledger.plan).toEqual([]);
      expect(ledger.balances.every((b: { net: number }) => b.net === 0)).toBe(true);
    }
    expect(after.settlements.length).toBeGreaterThan(0);
  });

  it("shows each member their own position in the group list", async () => {
    const id = await createGroup(ana, "Flat", "USD");
    await join(ana, id, ben);
    await ana.post(`/api/groups/${id}/expenses`, expense(ana.id, 5000, [ana.id, ben.id]));
    const anaGroups = (await ana.get("/api/groups")).json();
    const benGroups = (await ben.get("/api/groups")).json();
    expect(anaGroups.find((g: { id: string }) => g.id === id)).toMatchObject({ memberCount: 2, myBalances: { USD: 2500 } });
    expect(benGroups.find((g: { id: string }) => g.id === id).myBalances).toEqual({ USD: -2500 });
  });

  it("refuses paying yourself", async () => {
    const res = await ana.post(url("/settlements"), { fromUserId: ana.id, toUserId: ana.id, amount: 100, currency: "EUR" });
    expect(res.statusCode).toBe(400);
  });
});

describe("activity and export", () => {
  it("logs who did what, newest first", async () => {
    const log = (await cy.get(url("/activity"))).json();
    const kinds = log.map((a: { kind: string }) => a.kind);
    expect(kinds.at(-1)).toBe("group.created");
    expect(kinds).toContain("member.joined");
    expect(kinds).toContain("expense.deleted");
    expect(kinds[0]).toBe("settlement.recorded");
    expect(log.find((a: { kind: string; summary: string }) => a.kind === "expense.added" && a.summary.includes("Hotel"))).toMatchObject({
      actorName: "Ana",
      summary: 'added "Hotel" (€100.00)',
    });
  });

  it("exports expenses and payments as CSV", async () => {
    const res = await ana.get(url("/export.csv"));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="lisbon.csv"');
    const lines = res.body.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Description,Paid by,Amount,Currency,Split,Ana,Ben,Cy");
    expect(lines).toContain("2026-10-20,expense,Hotel,Ana,100.00,EUR,equal,33.34,33.33,33.33");
    expect(lines.some((l) => l.includes(",payment,"))).toBe(true);
  });

  it("neutralises spreadsheet formulas in descriptions", async () => {
    await ana.post(url("/expenses"), expense(ana.id, 100, [ana.id], { description: "=HYPERLINK(\"http://x\")" }));
    const body = (await ana.get(url("/export.csv"))).body;
    expect(body).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});
