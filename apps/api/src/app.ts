import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { SessionStore } from "./auth/sessions";
import type { Ctx } from "./context";
import type { Database } from "./db";
import { HttpError } from "./http";
import { activityRoutes } from "./routes/activity";
import { authRoutes } from "./routes/auth";
import { expenseRoutes } from "./routes/expenses";
import { exportRoutes } from "./routes/export";
import { groupRoutes } from "./routes/groups";
import { inviteRoutes } from "./routes/invites";
import { ledgerRoutes } from "./routes/ledger";

export interface AppOptions {
  database: Database;
  /** Defaults to true when the database is the in-memory fallback. */
  demo?: boolean;
  /** HMAC key for signed demo sessions; at least 32 characters. */
  sessionSecret?: string | undefined;
  secureCookies?: boolean;
  /** Serve the built web app from this folder (Docker and e2e); Vercel uses its CDN instead. */
  webRoot?: string | undefined;
  logger?: boolean;
  rateLimit?: boolean;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const demo = options.demo ?? !options.database.persistent;
  const ctx: Ctx = {
    db: options.database.db,
    demo,
    sessions: new SessionStore(options.database.db, demo ? "signed" : "database", options.sessionSecret),
    cookie: { name: "sl_session", secure: options.secureCookies ?? false },
  };

  const app = Fastify({ logger: options.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });

  // JSON only: a cross-site HTML form can send text/plain without a preflight.
  app.removeContentTypeParser("text/plain");

  await app.register(cookie);
  if (options.rateLimit ?? true) await app.register(rateLimit, { global: false });

  app.decorateRequest("userId", null);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: error.message, ...(error.issues ? { issues: error.issues } : {}) });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: (error as Error).message });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Something went wrong on our side." });
  });

  await app.register(
    async (api) => {
      api.addHook("onRequest", async (request) => {
        // Second line of CSRF defence after SameSite=Lax: unsafe requests from another origin are refused.
        const origin = request.headers.origin;
        if (UNSAFE.has(request.method) && origin) {
          let host: string | undefined;
          try {
            host = new URL(origin).host;
          } catch {
            host = undefined;
          }
          if (host !== request.host) throw new HttpError(403, "Cross-origin request refused.");
        }
        request.userId = await ctx.sessions.resolve(request.cookies[ctx.cookie.name]);
      });

      api.get("/health", async () => ({ ok: true, persistent: options.database.persistent, demo }));
      authRoutes(api, ctx);
      groupRoutes(api, ctx);
      expenseRoutes(api, ctx);
      ledgerRoutes(api, ctx);
      activityRoutes(api, ctx);
      inviteRoutes(api, ctx);
      exportRoutes(api, ctx);
    },
    { prefix: "/api" },
  );

  const webRoot = options.webRoot === undefined ? undefined : resolve(options.webRoot);
  const serveWeb = webRoot !== undefined && existsSync(join(webRoot, "index.html"));
  if (serveWeb) await app.register(fastifyStatic, { root: webRoot, wildcard: false });

  app.setNotFoundHandler((request, reply) => {
    // Client-side routes (/groups/..., /invite/...) all load the single-page app,
    // but a missing file such as an old /assets/*.js bundle stays a 404.
    const path = request.url.split("?")[0] ?? "";
    if (serveWeb && request.method === "GET" && !path.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(path)) {
      return reply.type("text/html").header("cache-control", "no-cache").sendFile("index.html");
    }
    return reply.status(404).send({ error: "Not found" });
  });

  return app;
}
