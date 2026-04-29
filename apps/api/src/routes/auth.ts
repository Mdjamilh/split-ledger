import { loginInput, registerInput, type AppConfig, type User } from "@split-ledger/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { dummyHash, hashPassword, verifyPassword } from "../auth/password";
import { clearSessionCookie, requireUser, setSessionCookie, type Ctx } from "../context";
import { schema } from "../db";
import { DEMO_USER_ID } from "../demo/ids";
import { HttpError, parseBody } from "../http";

const authLimit = { rateLimit: { max: 10, timeWindow: "1 minute" } };

const publicUser = (u: { id: string; email: string; name: string }): User => ({ id: u.id, email: u.email, name: u.name });

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get("/config", async (): Promise<AppConfig> => ({ demo: ctx.demo }));

  app.post("/auth/register", { config: authLimit }, async (request, reply) => {
    const input = parseBody(registerInput, request.body);
    const [existing] = await ctx.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, input.email));
    if (existing) throw new HttpError(409, "An account with that email already exists.");
    const [user] = await ctx.db
      .insert(schema.users)
      .values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) })
      .returning();
    const session = await ctx.sessions.issue(user!.id);
    setSessionCookie(ctx, reply, session.token, session.expiresAt);
    return reply.status(201).send(publicUser(user!));
  });

  app.post("/auth/login", { config: authLimit }, async (request, reply) => {
    const input = parseBody(loginInput, request.body);
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, input.email));
    // Hash even when the email is unknown so timing doesn't reveal which accounts exist.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) throw new HttpError(401, "Wrong email or password.");
    const session = await ctx.sessions.issue(user.id);
    setSessionCookie(ctx, reply, session.token, session.expiresAt);
    return publicUser(user);
  });

  app.post("/auth/demo", { config: authLimit }, async (_request, reply) => {
    if (!ctx.demo) throw new HttpError(404, "Not found");
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, DEMO_USER_ID));
    if (!user) throw new HttpError(503, "The demo data is not loaded.");
    const session = await ctx.sessions.issue(user.id);
    setSessionCookie(ctx, reply, session.token, session.expiresAt);
    return publicUser(user);
  });

  app.post("/auth/logout", async (request, reply) => {
    await ctx.sessions.revoke(request.cookies[ctx.cookie.name]);
    clearSessionCookie(ctx, reply);
    return reply.status(204).send();
  });

  app.get("/auth/me", async (request) => {
    const userId = requireUser(request);
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, userId));
    // A signed demo token can outlive the in-memory account it names.
    if (!user) throw new HttpError(401, "Please sign in.");
    return publicUser(user);
  });
}
