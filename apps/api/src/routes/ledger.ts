import { formatMoney, settlementInput } from "@split-ledger/shared";
import type { FastifyInstance } from "fastify";

import { requireUser, type Ctx } from "../context";
import { schema } from "../db";
import { HttpError, parseBody } from "../http";
import { groupMembers, requireMembership } from "../services/access";
import { logActivity } from "../services/activity";
import { groupBalances } from "../services/ledger";

type Params = { groupId: string };

export function ledgerRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Params: Params }>("/groups/:groupId/balances", async (request) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const members = await groupMembers(ctx.db, group.id);
    return groupBalances(
      ctx.db,
      group,
      members.map((m) => m.id),
    );
  });

  /** Records that one member paid another back, outside the app. */
  app.post<{ Params: Params }>("/groups/:groupId/settlements", async (request, reply) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const input = parseBody(settlementInput, request.body);
    const members = new Map((await groupMembers(ctx.db, group.id)).map((m) => [m.id, m]));
    const from = members.get(input.fromUserId);
    const to = members.get(input.toUserId);
    if (!from || !to) throw new HttpError(400, "Both people must be members of the group.");

    const id = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.settlements)
        .values({ groupId: group.id, ...input, createdBy: userId })
        .returning({ id: schema.settlements.id });
      await logActivity(tx, {
        groupId: group.id,
        actorId: userId,
        kind: "settlement.recorded",
        summary: `recorded ${from.name} paying ${to.name} ${formatMoney(input.amount, input.currency)}`,
        data: { settlementId: row!.id },
      });
      return row!.id;
    });
    return reply.status(201).send({ id });
  });
}
