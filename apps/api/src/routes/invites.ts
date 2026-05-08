import { randomBytes } from "node:crypto";

import type { Invite, InvitePreview } from "@split-ledger/shared";
import { and, count, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { sha256 } from "../auth/sessions";
import { requireUser, type Ctx } from "../context";
import { schema, type Db } from "../db";
import { notFound } from "../http";
import { requireMembership } from "../services/access";
import { logActivity } from "../services/activity";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function findInvite(db: Db, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw notFound("This invite link is invalid or has expired.");
  const [row] = await db
    .select({ invite: schema.invites, group: schema.groups, inviter: schema.users.name })
    .from(schema.invites)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.invites.groupId))
    .innerJoin(schema.users, eq(schema.users.id, schema.invites.createdBy))
    .where(and(eq(schema.invites.tokenHash, sha256(token)), gt(schema.invites.expiresAt, new Date())));
  if (!row) throw notFound("This invite link is invalid or has expired.");
  return row;
}

async function isMember(db: Db, groupId: string, userId: string) {
  const [row] = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.groupId, groupId), eq(schema.memberships.userId, userId)));
  return Boolean(row);
}

export function inviteRoutes(app: FastifyInstance, ctx: Ctx) {
  /** Any member can create a link; whoever opens it while signed in can join. */
  app.post<{ Params: { groupId: string } }>("/groups/:groupId/invites", async (request, reply): Promise<Invite> => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const token = randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await ctx.db.transaction(async (tx) => {
      await tx.insert(schema.invites).values({ tokenHash: sha256(token), groupId: group.id, createdBy: userId, expiresAt });
      await logActivity(tx, { groupId: group.id, actorId: userId, kind: "invite.created", summary: "created an invite link" });
    });
    reply.status(201);
    return { token, expiresAt: expiresAt.toISOString() };
  });

  app.get<{ Params: { token: string } }>("/invites/:token", async (request): Promise<InvitePreview> => {
    const userId = requireUser(request);
    const { group, inviter } = await findInvite(ctx.db, request.params.token);
    const [members] = await ctx.db.select({ n: count() }).from(schema.memberships).where(eq(schema.memberships.groupId, group.id));
    return {
      groupId: group.id,
      groupName: group.name,
      memberCount: members?.n ?? 0,
      invitedBy: inviter,
      alreadyMember: await isMember(ctx.db, group.id, userId),
    };
  });

  app.post<{ Params: { token: string } }>("/invites/:token/accept", async (request) => {
    const userId = requireUser(request);
    const { group } = await findInvite(ctx.db, request.params.token);
    if (!(await isMember(ctx.db, group.id, userId))) {
      await ctx.db.transaction(async (tx) => {
        await tx.insert(schema.memberships).values({ groupId: group.id, userId, role: "member" }).onConflictDoNothing();
        await logActivity(tx, { groupId: group.id, actorId: userId, kind: "member.joined", summary: "joined the group" });
      });
    }
    return { groupId: group.id };
  });
}
