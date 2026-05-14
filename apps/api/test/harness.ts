import type { ExpenseInput } from "@split-ledger/shared";
import type { FastifyInstance, InjectOptions } from "fastify";

import { buildApp, type AppOptions } from "../src/app";
import type { Database } from "../src/db";
import { testDatabase } from "./db";

export interface TestApp {
  app: FastifyInstance;
  database: Database;
  close(): Promise<void>;
}

export async function startApp(options: Partial<AppOptions> = {}): Promise<TestApp> {
  const database = await testDatabase();
  const app = await buildApp({ database, demo: false, rateLimit: false, ...options });
  return {
    app,
    database,
    async close() {
      await app.close();
      await database.close();
    },
  };
}

/** A signed-in user: remembers the session cookie like a browser would. */
export class Client {
  cookie = "";
  id = "";

  constructor(private readonly app: FastifyInstance) {}

  async request(method: InjectOptions["method"], url: string, body?: unknown) {
    const res = await this.app.inject({
      method,
      url,
      headers: this.cookie ? { cookie: this.cookie } : {},
      ...(body === undefined ? {} : { payload: body as InjectOptions["payload"] }),
    });
    const setCookie = res.cookies.find((c) => c.name === "sl_session");
    if (setCookie) this.cookie = setCookie.value ? `sl_session=${setCookie.value}` : "";
    return res;
  }

  get = (url: string) => this.request("GET", url);
  post = (url: string, body: unknown = {}) => this.request("POST", url, body);
  put = (url: string, body: unknown) => this.request("PUT", url, body);
  del = (url: string) => this.request("DELETE", url);

  static async register(app: FastifyInstance, name: string): Promise<Client> {
    const client = new Client(app);
    const res = await client.post("/api/auth/register", {
      email: `${name.toLowerCase()}@example.com`,
      name,
      password: "password123",
    });
    if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
    client.id = res.json().id;
    return client;
  }
}

export async function createGroup(owner: Client, name = "Trip", currency = "USD"): Promise<string> {
  const res = await owner.post("/api/groups", { name, currency });
  if (res.statusCode !== 201) throw new Error(res.body);
  return res.json().id;
}

/** Owner creates an invite and each guest accepts it. */
export async function join(owner: Client, groupId: string, ...guests: Client[]) {
  const { token } = (await owner.post(`/api/groups/${groupId}/invites`)).json();
  for (const guest of guests) {
    const res = await guest.post(`/api/invites/${token}/accept`);
    if (res.statusCode !== 200) throw new Error(res.body);
  }
}

export function expense(paidBy: string, amount: number, participants: string[], extra: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    description: "Dinner",
    amount,
    currency: "USD",
    paidBy,
    occurredOn: "2026-10-20",
    method: "equal",
    entries: participants.map((userId) => ({ userId, value: 0 })),
    ...extra,
  };
}
