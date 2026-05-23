import type { FastifyInstance } from "fastify";

import { buildApp } from "./app";
import { createDb } from "./db";
import { seedDemo } from "./demo/seed";

export interface BootOptions {
  migrationsFolder?: string;
  webRoot?: string | undefined;
}

/**
 * Configures the app from the environment, shared by the Node server, the
 * Docker image and the Vercel function:
 *
 * - DATABASE_URL: Postgres. Without it the app runs on in-memory PGlite in
 *   demo mode, seeded with sample data.
 * - SESSION_SECRET: HMAC key for demo sessions (required in production demo
 *   mode so every serverless instance accepts the same cookies).
 * - DEMO_MODE=1 / 0: force demo mode on or off.
 */
export async function boot(options: BootOptions = {}): Promise<FastifyInstance> {
  const production = process.env.NODE_ENV === "production";
  const database = await createDb({
    url: process.env.DATABASE_URL || undefined,
    ...(options.migrationsFolder ? { migrationsFolder: options.migrationsFolder } : {}),
  });
  const demo = process.env.DEMO_MODE ? process.env.DEMO_MODE === "1" : !database.persistent;
  const sessionSecret = process.env.SESSION_SECRET || undefined;
  if (demo && production && !sessionSecret) {
    console.warn("SESSION_SECRET is not set: demo sessions will not survive a change of instance.");
  }
  if (demo) await seedDemo(database.db);

  return buildApp({
    database,
    demo,
    sessionSecret,
    secureCookies: production,
    webRoot: options.webRoot,
    logger: process.env.LOG_REQUESTS === "1",
  });
}
