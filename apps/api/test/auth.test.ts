import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, startApp, type TestApp } from "./harness";

let t: TestApp;
beforeAll(async () => (t = await startApp()));
afterAll(() => t.close());

describe("auth", () => {
  it("registers, reads /me and logs out", async () => {
    const ana = await Client.register(t.app, "Ana");
    const me = await ana.get("/api/auth/me");
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ id: ana.id, email: "ana@example.com", name: "Ana" });

    expect((await ana.post("/api/auth/logout")).statusCode).toBe(204);
    expect((await ana.get("/api/auth/me")).statusCode).toBe(401);
  });

  it("sets an httpOnly, SameSite=Lax session cookie", async () => {
    const client = new Client(t.app);
    const res = await client.post("/api/auth/register", { email: "cookie@example.com", name: "C", password: "password123" });
    const cookie = res.cookies.find((c) => c.name === "sl_session");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  });

  it("logs in with the right password only", async () => {
    await Client.register(t.app, "Ben");
    const client = new Client(t.app);
    const wrong = await client.post("/api/auth/login", { email: "ben@example.com", password: "nope-nope" });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error).toBe("Wrong email or password.");
    const unknown = await client.post("/api/auth/login", { email: "nobody@example.com", password: "password123" });
    expect(unknown.json()).toEqual(wrong.json());

    const ok = await client.post("/api/auth/login", { email: "BEN@example.com", password: "password123" });
    expect(ok.statusCode).toBe(200);
    expect((await client.get("/api/auth/me")).json().name).toBe("Ben");
  });

  it("refuses duplicate emails", async () => {
    await Client.register(t.app, "Cy");
    const res = await new Client(t.app).post("/api/auth/register", { email: "cy@example.com", name: "Cy 2", password: "password123" });
    expect(res.statusCode).toBe(409);
  });

  it("explains validation problems field by field", async () => {
    const res = await new Client(t.app).post("/api/auth/register", { email: "not-an-email", name: "", password: "x" });
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.map((i: { path: string }) => i.path).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects forged and garbage cookies", async () => {
    const client = new Client(t.app);
    client.cookie = "sl_session=s.00000000-0000-4000-8000-000000000000.9999999999999.forged";
    expect((await client.get("/api/auth/me")).statusCode).toBe(401);
    client.cookie = "sl_session=random-garbage";
    expect((await client.get("/api/auth/me")).statusCode).toBe(401);
  });

  it("hides the demo sign-in outside demo mode", async () => {
    expect((await new Client(t.app).post("/api/auth/demo")).statusCode).toBe(404);
    expect((await new Client(t.app).get("/api/config")).json()).toEqual({ demo: false });
  });
});

describe("request hygiene", () => {
  it("refuses unsafe cross-origin requests", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example", host: "localhost:80" },
      payload: { email: "a@b.co", password: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("accepts same-origin requests", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://split.example", host: "split.example" },
      payload: { email: "a@b.co", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("does not accept text/plain bodies, which forms can send cross-site", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/plain" },
      payload: JSON.stringify({ email: "a@b.co", password: "x" }),
    });
    expect(res.statusCode).toBe(415);
  });

  it("answers unknown API routes with JSON 404s", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found" });
  });
});
