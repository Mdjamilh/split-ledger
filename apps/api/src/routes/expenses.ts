import { computeShares, expenseInput, formatMoney, type Currency } from "@split-ledger/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { requireUser, type Ctx } from "../context";
import { schema, type Db } from "../db";
import { HttpError, notFound, parseBody, uuidParam } from "../http";
import { groupMembers, requireMembership } from "../services/access";
import { logActivity } from "../services/activity";
import { loadExpenses } from "../services/ledger";

type Params = { groupId: string; expenseId: string };

/** Validates the body against the split rules and the group's member list. */
async function validated(db: Db, groupId: string, body: unknown) {
  const input = parseBody(expenseInput, body);
  const memberIds = new Set((await groupMembers(db, groupId)).map((m) => m.id));
  if (!memberIds.has(input.paidBy)) throw new HttpError(400, "The payer must be a member of the group.");
  if (input.entries.some((e) => !memberIds.has(e.userId))) {
    throw new HttpError(400, "Everyone in the split must be a member of the group.");
  }
  const split = computeShares(input.amount, input.method, input.entries);
  if (!split.ok) throw new HttpError(400, split.error);
  return { input, shares: split.shares };
}

async function writeShares(db: Db, expenseId: string, v: Awaited<ReturnType<typeof validated>>) {
  await db.insert(schema.expenseShares).values(
    v.shares.map((share, position) => ({
      expenseId,
      userId: share.userId,
      amount: share.amount,
      value: v.input.entries[position]!.value,
      position,
    })),
  );
}

async function findExpense(db: Db, groupId: string, rawId: string) {
  const expenseId = uuidParam(rawId, "Expense not found");
  const [row] = await db
    .select()
    .from(schema.expenses)
    .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, groupId)));
  if (!row) throw notFound("Expense not found");
  return row;
}

export function expenseRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Params: Params }>("/groups/:groupId/expenses", async (request) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    return loadExpenses(ctx.db, group.id);
  });

  app.post<{ Params: Params }>("/groups/:groupId/expenses", async (request, reply) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const v = await validated(ctx.db, group.id, request.body);
    const id = await ctx.db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(schema.expenses)
        .values({
          groupId: group.id,
          description: v.input.description,
          amount: v.input.amount,
          currency: v.input.currency,
          paidBy: v.input.paidBy,
          method: v.input.method,
          occurredOn: v.input.occurredOn,
          createdBy: userId,
        })
        .returning({ id: schema.expenses.id });
      await writeShares(tx, expense!.id, v);
      await logActivity(tx, {
        groupId: group.id,
        actorId: userId,
        kind: "expense.added",
        summary: `added "${v.input.description}" (${formatMoney(v.input.amount, v.input.currency)})`,
        data: { expenseId: expense!.id },
      });
      return expense!.id;
    });
    return reply.status(201).send({ id });
  });

  app.put<{ Params: Params }>("/groups/:groupId/expenses/:expenseId", async (request) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const existing = await findExpense(ctx.db, group.id, request.params.expenseId);
    const v = await validated(ctx.db, group.id, request.body);
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(schema.expenses)
        .set({
          description: v.input.description,
          amount: v.input.amount,
          currency: v.input.currency,
          paidBy: v.input.paidBy,
          method: v.input.method,
          occurredOn: v.input.occurredOn,
        })
        .where(eq(schema.expenses.id, existing.id));
      await tx.delete(schema.expenseShares).where(eq(schema.expenseShares.expenseId, existing.id));
      await writeShares(tx, existing.id, v);
      await logActivity(tx, {
        groupId: group.id,
        actorId: userId,
        kind: "expense.updated",
        summary: `updated "${v.input.description}" (${formatMoney(v.input.amount, v.input.currency)})`,
        data: { expenseId: existing.id },
      });
    });
    return { id: existing.id };
  });

  app.delete<{ Params: Params }>("/groups/:groupId/expenses/:expenseId", async (request, reply) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const existing = await findExpense(ctx.db, group.id, request.params.expenseId);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(schema.expenses).where(eq(schema.expenses.id, existing.id));
      await logActivity(tx, {
        groupId: group.id,
        actorId: userId,
        kind: "expense.deleted",
        summary: `deleted "${existing.description}" (${formatMoney(existing.amount, existing.currency as Currency)})`,
      });
    });
    return reply.status(204).send();
  });
}
