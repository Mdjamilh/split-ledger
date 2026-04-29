import { createGroupInput, type Currency, type GroupDetail, type GroupSummary } from "@split-ledger/shared";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { requireUser, type Ctx } from "../context";
import { schema, type Db } from "../db";
import { parseBody } from "../http";
import { groupMembers, requireMembership } from "../services/access";
import { logActivity } from "../services/activity";

/**
 * The signed-in user's net position per group and currency, from four
 * aggregates instead of loading every expense of every group.
 */
async function myBalances(db: Db, userId: string, groupIds: string[]) {
  const result = new Map<string, Record<string, number>>();
  if (groupIds.length === 0) return result;
  const add = (groupId: string, currency: string, delta: number) => {
    const entry = result.get(groupId) ?? {};
    entry[currency] = (entry[currency] ?? 0) + delta;
    result.set(groupId, entry);
  };
  const e = schema.expenses;
  const s = schema.settlements;
  const total = (col: typeof e.amount | typeof s.amount) => sql<string>`coalesce(sum(${col}), 0)`;

  const [paid, owed, sent, received] = await Promise.all([
    db
      .select({ groupId: e.groupId, currency: e.currency, total: total(e.amount) })
      .from(e)
      .where(and(eq(e.paidBy, userId), inArray(e.groupId, groupIds)))
      .groupBy(e.groupId, e.currency),
    db
      .select({ groupId: e.groupId, currency: e.currency, total: sql<string>`coalesce(sum(${schema.expenseShares.amount}), 0)` })
      .from(schema.expenseShares)
      .innerJoin(e, eq(e.id, schema.expenseShares.expenseId))
      .where(and(eq(schema.expenseShares.userId, userId), inArray(e.groupId, groupIds)))
      .groupBy(e.groupId, e.currency),
    db
      .select({ groupId: s.groupId, currency: s.currency, total: total(s.amount) })
      .from(s)
      .where(and(eq(s.fromUserId, userId), inArray(s.groupId, groupIds)))
      .groupBy(s.groupId, s.currency),
    db
      .select({ groupId: s.groupId, currency: s.currency, total: total(s.amount) })
      .from(s)
      .where(and(eq(s.toUserId, userId), inArray(s.groupId, groupIds)))
      .groupBy(s.groupId, s.currency),
  ]);
  for (const r of paid) add(r.groupId, r.currency, Number(r.total));
  for (const r of owed) add(r.groupId, r.currency, -Number(r.total));
  for (const r of sent) add(r.groupId, r.currency, Number(r.total));
  for (const r of received) add(r.groupId, r.currency, -Number(r.total));
  return result;
}

export function groupRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get("/groups", async (request): Promise<GroupSummary[]> => {
    const userId = requireUser(request);
    const mine = await ctx.db
      .select({ group: schema.groups })
      .from(schema.memberships)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.memberships.groupId))
      .where(eq(schema.memberships.userId, userId))
      .orderBy(desc(schema.groups.createdAt));
    const ids = mine.map((m) => m.group.id);
    if (ids.length === 0) return [];

    const [counts, balances] = await Promise.all([
      ctx.db
        .select({ groupId: schema.memberships.groupId, n: count() })
        .from(schema.memberships)
        .where(inArray(schema.memberships.groupId, ids))
        .groupBy(schema.memberships.groupId),
      myBalances(ctx.db, userId, ids),
    ]);
    const countOf = new Map(counts.map((c) => [c.groupId, c.n]));
    return mine.map(({ group }) => ({
      id: group.id,
      name: group.name,
      currency: group.currency as Currency,
      memberCount: countOf.get(group.id) ?? 1,
      myBalances: balances.get(group.id) ?? {},
      createdAt: group.createdAt.toISOString(),
    }));
  });

  app.post("/groups", async (request, reply) => {
    const userId = requireUser(request);
    const input = parseBody(createGroupInput, request.body);
    const group = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.groups)
        .values({ name: input.name, currency: input.currency, createdBy: userId })
        .returning();
      await tx.insert(schema.memberships).values({ groupId: created!.id, userId, role: "owner" });
      await logActivity(tx, { groupId: created!.id, actorId: userId, kind: "group.created", summary: `created the group "${input.name}"` });
      return created!;
    });
    return reply.status(201).send({ id: group.id });
  });

  app.get<{ Params: { groupId: string } }>("/groups/:groupId", async (request): Promise<GroupDetail> => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    return {
      id: group.id,
      name: group.name,
      currency: group.currency as Currency,
      createdAt: group.createdAt.toISOString(),
      members: await groupMembers(ctx.db, group.id),
    };
  });
}
