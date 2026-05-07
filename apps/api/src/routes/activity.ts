import type { Activity } from "@split-ledger/shared";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { requireUser, type Ctx } from "../context";
import { schema } from "../db";
import { requireMembership } from "../services/access";

export function activityRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Params: { groupId: string }; Querystring: { limit?: string } }>(
    "/groups/:groupId/activity",
    async (request): Promise<Activity[]> => {
      const userId = requireUser(request);
      const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      const rows = await ctx.db
        .select({ entry: schema.activity, actorName: schema.users.name })
        .from(schema.activity)
        .innerJoin(schema.users, eq(schema.users.id, schema.activity.actorId))
        .where(eq(schema.activity.groupId, group.id))
        .orderBy(desc(schema.activity.createdAt), desc(schema.activity.id))
        .limit(limit);
      return rows.map(({ entry, actorName }) => ({
        id: entry.id,
        kind: entry.kind as Activity["kind"],
        actorId: entry.actorId,
        actorName,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString(),
      }));
    },
  );
}
