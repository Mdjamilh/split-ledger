import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_USER_ID } from "../src/demo/ids";
import { DEMO_PASSWORD, seedDemo } from "../src/demo/seed";
import { Client, startApp, type TestApp } from "./harness";

const secret = "demo-secret-".padEnd(40, "x");
let t: TestApp;

beforeAll(async () => {
  t = await startApp({ demo: true, sessionSecret: secret });
  await seedDemo(t.database.db);
});
afterAll(() => t.close());

describe("demo mode", () => {
  it("advertises itself in the config", async () => {
    expect((await new Client(t.app).get("/api/config")).json()).toEqual({ demo: true });
  });

  it("signs in with one click and shows the seeded groups", async () => {
    const visitor = new Client(t.app);
    const res = await visitor.post("/api/auth/demo");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: DEMO_USER_ID, name: "Alex Rivera" });
    const groups = (await visitor.get("/api/groups")).json();
    expect(groups.map((g: { name: string }) => g.name).sort()).toEqual(["Flat 4B", "Friday board games", "Lisbon long weekend"]);
  });

  it("issues signed cookies that another instance with the same secret accepts", async () => {
    const visitor = new Client(t.app);
    await visitor.post("/api/auth/demo");
    expect(visitor.cookie).toMatch(/^sl_session=s\./);

    // A second "serverless instance": its own in-memory database, seeded identically.
    const other = await startApp({ demo: true, sessionSecret: secret });
    await seedDemo(other.database.db);
    try {
      const sameCookie = new Client(other.app);
      sameCookie.cookie = visitor.cookie;
      expect((await sameCookie.get("/api/auth/me")).json().id).toBe(DEMO_USER_ID);
      const lisbon = (await visitor.get("/api/groups")).json().find((g: { name: string }) => g.name.startsWith("Lisbon"));
      expect((await sameCookie.get(`/api/groups/${lisbon.id}`)).statusCode).toBe(200);
    } finally {
      await other.close();
    }
  });

  it("also accepts the demo password", async () => {
    const res = await new Client(t.app).post("/api/auth/login", { email: "demo@split-ledger.app", password: DEMO_PASSWORD });
    expect(res.statusCode).toBe(200);
  });

  it("seeds balanced ledgers with a non-trivial settle-up plan", async () => {
    const visitor = new Client(t.app);
    await visitor.post("/api/auth/demo");
    for (const group of (await visitor.get("/api/groups")).json()) {
      const { ledgers } = (await visitor.get(`/api/groups/${group.id}/balances`)).json();
      for (const ledger of ledgers) {
        expect(ledger.balances.reduce((a: number, b: { net: number }) => a + b.net, 0)).toBe(0);
        expect(ledger.plan.length).toBeGreaterThan(0);
      }
    }
  });

  it("is idempotent", async () => {
    await seedDemo(t.database.db);
    const visitor = new Client(t.app);
    await visitor.post("/api/auth/demo");
    expect((await visitor.get("/api/groups")).json()).toHaveLength(3);
  });
});
