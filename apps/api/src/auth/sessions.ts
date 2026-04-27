import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { schema, type Db } from "../db";

/*
 * Two kinds of session token, chosen by deployment mode.
 *
 * "database" (a real Postgres is configured): the cookie holds 32 random
 * bytes and the sessions table stores only their SHA-256, so a leaked
 * database can't be replayed as cookies and logging out revokes the session.
 *
 * "signed" (the public demo on the in-memory database): serverless instances
 * don't share memory, so a session row written by one instance is unknown to
 * the next and visitors would be logged out at random. Instead the cookie is
 * a self-contained "s.<userId>.<expiresMs>.<hmac>" token that any instance can
 * verify with the shared SESSION_SECRET. Signed tokens are refused in
 * database mode, and database tokens are refused in signed mode.
 */

export type SessionMode = "database" | "signed";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SIGNED_PREFIX = "s.";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export class SessionStore {
  private readonly secret: string;

  constructor(
    private readonly db: Db,
    readonly mode: SessionMode,
    secret?: string,
  ) {
    if (secret !== undefined && secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    // A per-process key is fine locally; deployments set SESSION_SECRET so instances agree.
    this.secret = secret ?? randomBytes(32).toString("hex");
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("base64url");
  }

  async issue(userId: string, now = new Date()): Promise<IssuedSession> {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    if (this.mode === "signed") {
      const payload = `${userId}.${expiresAt.getTime()}`;
      return { token: `${SIGNED_PREFIX}${payload}.${this.sign(payload)}`, expiresAt };
    }
    const token = randomBytes(32).toString("base64url");
    await this.db.insert(schema.sessions).values({ tokenHash: sha256(token), userId, expiresAt });
    return { token, expiresAt };
  }

  /** The user id for a valid, unexpired token, otherwise null. */
  async resolve(token: string | undefined, now = new Date()): Promise<string | null> {
    if (!token || token.length > 200) return null;
    if (this.mode === "signed") return this.verifySigned(token, now);
    if (token.startsWith(SIGNED_PREFIX)) return null;
    const [row] = await this.db
      .select({ userId: schema.sessions.userId })
      .from(schema.sessions)
      .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, now)))
      .limit(1);
    return row?.userId ?? null;
  }

  private verifySigned(token: string, now: Date): string | null {
    if (!token.startsWith(SIGNED_PREFIX)) return null;
    const parts = token.slice(SIGNED_PREFIX.length).split(".");
    if (parts.length !== 3) return null;
    const [userId, expires, signature] = parts as [string, string, string];
    const expected = Buffer.from(this.sign(`${userId}.${expires}`));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (!/^\d+$/.test(expires) || Number(expires) <= now.getTime()) return null;
    return userId;
  }

  async revoke(token: string | undefined): Promise<void> {
    // Signed tokens can't be revoked server-side; clearing the cookie is enough for a demo.
    if (!token || this.mode === "signed") return;
    await this.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  }
}
