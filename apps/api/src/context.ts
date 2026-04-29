import type { FastifyReply, FastifyRequest } from "fastify";

import type { SessionStore } from "./auth/sessions";
import type { Db } from "./db";
import { HttpError } from "./http";

/** Everything a route module needs, passed in explicitly rather than hung off the Fastify instance. */
export interface Ctx {
  db: Db;
  sessions: SessionStore;
  /** Public demo: in-memory data, a seeded account and one-click sign-in. */
  demo: boolean;
  cookie: { name: string; secure: boolean };
}

declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
  }
}

/** The signed-in user's id, or a 401. */
export function requireUser(request: FastifyRequest): string {
  if (!request.userId) throw new HttpError(401, "Please sign in.");
  return request.userId;
}

export function setSessionCookie(ctx: Ctx, reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(ctx.cookie.name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.cookie.secure,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(ctx: Ctx, reply: FastifyReply) {
  reply.setCookie(ctx.cookie.name, "", { httpOnly: true, sameSite: "lax", secure: ctx.cookie.secure, path: "/", maxAge: 0 });
}
