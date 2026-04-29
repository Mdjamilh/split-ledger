import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/auth/password";
import { SESSION_TTL_MS, SessionStore } from "../src/auth/sessions";
import { schema, type Database } from "../src/db";
import { testDatabase } from "./db";

describe("passwords", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("sessions", () => {
  let database: Database;
  let userId: string;

  beforeAll(async () => {
    database = await testDatabase();
    const [user] = await database.db
      .insert(schema.users)
      .values({ email: "s@example.com", name: "S", passwordHash: "x" })
      .returning();
    userId = user!.id;
  });
  afterAll(() => database.close());

  it("database mode stores only a hash and can revoke", async () => {
    const store = new SessionStore(database.db, "database");
    const { token } = await store.issue(userId);
    const rows = await database.db.select().from(schema.sessions);
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect(await store.resolve(token)).toBe(userId);
    await store.revoke(token);
    expect(await store.resolve(token)).toBeNull();
  });

  it("database mode expires sessions", async () => {
    const store = new SessionStore(database.db, "database");
    const { token } = await store.issue(userId);
    expect(await store.resolve(token, new Date(Date.now() + SESSION_TTL_MS + 1000))).toBeNull();
  });

  it("signed mode works across instances that share the secret", async () => {
    const secret = "x".repeat(32);
    const a = new SessionStore(database.db, "signed", secret);
    const b = new SessionStore(database.db, "signed", secret);
    const { token } = await a.issue(userId);
    expect(await b.resolve(token)).toBe(userId);
    expect(await new SessionStore(database.db, "signed", "y".repeat(32)).resolve(token)).toBeNull();
  });

  it("signed mode rejects tampering and expiry", async () => {
    const store = new SessionStore(database.db, "signed", "k".repeat(32));
    const { token } = await store.issue(userId);
    const forged = token.replace(userId, "00000000-0000-4000-8000-000000000000");
    expect(await store.resolve(forged)).toBeNull();
    expect(await store.resolve(token, new Date(Date.now() + SESSION_TTL_MS + 1000))).toBeNull();
  });

  it("each mode refuses the other's tokens", async () => {
    const signed = new SessionStore(database.db, "signed", "k".repeat(32));
    const db = new SessionStore(database.db, "database");
    expect(await db.resolve((await signed.issue(userId)).token)).toBeNull();
    expect(await signed.resolve((await db.issue(userId)).token)).toBeNull();
  });

  it("refuses a short secret", () => {
    expect(() => new SessionStore(database.db, "signed", "short")).toThrow();
  });
});
