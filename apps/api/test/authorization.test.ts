import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, createGroup, expense, join, startApp, type TestApp } from "./harness";

/*
 * Users must only ever see groups they belong to. Every group-scoped route
 * is exercised as an outsider and must answer exactly like a missing group.
 */

let t: TestApp;
let owner: Client;
let friend: Client;
let outsider: Client;
let groupId: string;
let expenseId: string;

beforeAll(async () => {
  t = await startApp();
  owner = await Client.register(t.app, "Owner");
  friend = await Client.register(t.app, "Friend");
  outsider = await Client.register(t.app, "Outsider");
  groupId = await createGroup(owner, "Private trip");
  await join(owner, groupId, friend);
  expenseId = (await owner.post(`/api/groups/${groupId}/expenses`, expense(owner.id, 3000, [owner.id, friend.id]))).json().id;
});
afterAll(() => t.close());

describe("authorization", () => {
  it("requires a session for every group route", async () => {
    const anon = new Client(t.app);
    for (const url of ["/api/groups", `/api/groups/${groupId}`, `/api/groups/${groupId}/balances`]) {
      expect((await anon.get(url)).statusCode, url).toBe(401);
    }
  });

  it("does not list other people's groups", async () => {
    expect((await outsider.get("/api/groups")).json()).toEqual([]);
    expect((await friend.get("/api/groups")).json().map((g: { id: string }) => g.id)).toEqual([groupId]);
  });

  it("answers 404 to outsiders on every group-scoped route", async () => {
    const g = `/api/groups/${groupId}`;
    const attempts = [
      () => outsider.get(g),
      () => outsider.get(`${g}/expenses`),
      () => outsider.get(`${g}/balances`),
      () => outsider.get(`${g}/activity`),
      () => outsider.get(`${g}/export.csv`),
      () => outsider.post(`${g}/expenses`, expense(outsider.id, 100, [outsider.id])),
      () => outsider.put(`${g}/expenses/${expenseId}`, expense(owner.id, 1, [owner.id])),
      () => outsider.del(`${g}/expenses/${expenseId}`),
      () => outsider.post(`${g}/settlements`, { fromUserId: owner.id, toUserId: friend.id, amount: 100, currency: "USD" }),
      () => outsider.post(`${g}/invites`),
    ];
    for (const attempt of attempts) {
      const res = await attempt();
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Group not found");
    }
    // ...and nothing changed.
    expect((await owner.get(`${g}/expenses`)).json()).toHaveLength(1);
  });

  it("treats malformed ids as missing", async () => {
    expect((await owner.get("/api/groups/not-a-uuid")).statusCode).toBe(404);
    expect((await owner.del(`/api/groups/${groupId}/expenses/not-a-uuid`)).statusCode).toBe(404);
  });

  it("does not let an expense id from another group be edited through yours", async () => {
    const otherGroup = await createGroup(outsider, "Outsider's flat");
    const res = await outsider.del(`/api/groups/${otherGroup}/expenses/${expenseId}`);
    expect(res.statusCode).toBe(404);
    expect((await owner.get(`/api/groups/${groupId}/expenses`)).json()).toHaveLength(1);
  });

  it("does not let members add non-members to a split", async () => {
    const res = await owner.post(`/api/groups/${groupId}/expenses`, expense(owner.id, 3000, [owner.id, outsider.id]));
    expect(res.statusCode).toBe(400);
    const payer = await owner.post(`/api/groups/${groupId}/expenses`, expense(outsider.id, 3000, [owner.id]));
    expect(payer.statusCode).toBe(400);
    const settle = await owner.post(`/api/groups/${groupId}/settlements`, {
      fromUserId: outsider.id,
      toUserId: owner.id,
      amount: 100,
      currency: "USD",
    });
    expect(settle.statusCode).toBe(400);
  });

  it("lets an outsider in only through a valid invite", async () => {
    expect((await outsider.post("/api/invites/not-a-real-token-at-all/accept")).statusCode).toBe(404);
    const { token } = (await friend.post(`/api/groups/${groupId}/invites`)).json();
    const preview = (await outsider.get(`/api/invites/${token}`)).json();
    expect(preview).toMatchObject({ groupName: "Private trip", memberCount: 2, invitedBy: "Friend", alreadyMember: false });
    expect((await outsider.post(`/api/invites/${token}/accept`)).json()).toEqual({ groupId });
    expect((await outsider.get(`/api/groups/${groupId}`)).statusCode).toBe(200);
  });
});
