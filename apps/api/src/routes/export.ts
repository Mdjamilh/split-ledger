import { toDecimalString, type Currency } from "@split-ledger/shared";
import type { FastifyInstance } from "fastify";

import { requireUser, type Ctx } from "../context";
import { toCsv } from "../csv";
import { groupMembers, requireMembership } from "../services/access";
import { loadExpenses, loadSettlements } from "../services/ledger";

/**
 * One row per expense and per recorded payment, with a column per member
 * holding their share. Amounts are plain decimals in the row's currency.
 */
export function exportRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get<{ Params: { groupId: string } }>("/groups/:groupId/export.csv", async (request, reply) => {
    const userId = requireUser(request);
    const { group } = await requireMembership(ctx.db, request.params.groupId, userId);
    const [members, expenses, settlements] = await Promise.all([
      groupMembers(ctx.db, group.id),
      loadExpenses(ctx.db, group.id),
      loadSettlements(ctx.db, group.id),
    ]);
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const name = (id: string) => nameOf.get(id) ?? "Former member";

    const rows: (string | number)[][] = [
      ["Date", "Type", "Description", "Paid by", "Amount", "Currency", "Split", ...members.map((m) => m.name)],
    ];
    for (const e of [...expenses].reverse()) {
      const shareOf = new Map(e.shares.map((s) => [s.userId, s.amount]));
      rows.push([
        e.occurredOn,
        "expense",
        e.description,
        name(e.paidBy),
        toDecimalString(e.amount, e.currency),
        e.currency,
        e.method,
        ...members.map((m) => toDecimalString(shareOf.get(m.id) ?? 0, e.currency)),
      ]);
    }
    for (const s of [...settlements].reverse()) {
      const currency = s.currency as Currency;
      rows.push([
        s.createdAt.slice(0, 10),
        "payment",
        `${name(s.fromUserId)} paid ${name(s.toUserId)}`,
        name(s.fromUserId),
        toDecimalString(s.amount, currency),
        currency,
        "",
        ...members.map(() => ""),
      ]);
    }

    const filename = `${group.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "group"}.csv`;
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${filename}"`)
      .send(toCsv(rows));
  });
}
