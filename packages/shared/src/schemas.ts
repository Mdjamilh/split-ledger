import { z } from "zod";

import { CURRENCY_CODES, MAX_MINOR } from "./money";
import { computeShares, SPLIT_METHODS } from "./split";

/*
 * The API contract. The server validates every request body with these
 * schemas and the web app builds its forms and response types from them, so
 * a field renamed here is a type error on both ends.
 */

export const currencySchema = z.enum(CURRENCY_CODES);
export const minorAmountSchema = z.number().int().positive().max(MAX_MINOR);
const id = z.uuid();
const isoDate = z.iso.date();

// --- Auth -------------------------------------------------------------------

export const emailSchema = z.email().max(254).transform((e) => e.trim().toLowerCase());

export const registerInput = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Enter your name").max(60),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});
export type RegisterInput = z.input<typeof registerInput>;

export const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});
export type LoginInput = z.input<typeof loginInput>;

export const userSchema = z.object({ id, email: z.string(), name: z.string() });
export type User = z.infer<typeof userSchema>;

export const configSchema = z.object({ demo: z.boolean() });
export type AppConfig = z.infer<typeof configSchema>;

// --- Groups -----------------------------------------------------------------

export const createGroupInput = z.object({
  name: z.string().trim().min(1, "Give the group a name").max(80),
  currency: currencySchema,
});
export type CreateGroupInput = z.input<typeof createGroupInput>;

export const memberSchema = z.object({
  id,
  name: z.string(),
  email: z.string(),
  role: z.enum(["owner", "member"]),
});
export type Member = z.infer<typeof memberSchema>;

export const groupSummarySchema = z.object({
  id,
  name: z.string(),
  currency: currencySchema,
  memberCount: z.number().int(),
  /** The signed-in user's net balance in each currency that has activity. */
  myBalances: z.record(z.string(), z.number().int()),
  createdAt: z.string(),
});
export type GroupSummary = z.infer<typeof groupSummarySchema>;

export const groupDetailSchema = z.object({
  id,
  name: z.string(),
  currency: currencySchema,
  createdAt: z.string(),
  members: z.array(memberSchema),
});
export type GroupDetail = z.infer<typeof groupDetailSchema>;

// --- Expenses ---------------------------------------------------------------

export const splitMethodSchema = z.enum(SPLIT_METHODS);

export const expenseInput = z
  .object({
    description: z.string().trim().min(1, "Describe the expense").max(120),
    amount: minorAmountSchema,
    currency: currencySchema,
    paidBy: id,
    occurredOn: isoDate,
    method: splitMethodSchema,
    entries: z
      .array(z.object({ userId: id, value: z.number().int().min(0).max(MAX_MINOR) }))
      .min(1, "Pick at least one person")
      .max(50),
  })
  .superRefine((input, ctx) => {
    const result = computeShares(input.amount, input.method, input.entries);
    if (!result.ok) ctx.addIssue({ code: "custom", path: ["entries"], message: result.error });
  });
export type ExpenseInput = z.input<typeof expenseInput>;

export const expenseSchema = z.object({
  id,
  description: z.string(),
  amount: z.number().int(),
  currency: currencySchema,
  paidBy: id,
  method: splitMethodSchema,
  occurredOn: z.string(),
  createdAt: z.string(),
  createdBy: id,
  shares: z.array(z.object({ userId: id, amount: z.number().int(), value: z.number().int() })),
});
export type Expense = z.infer<typeof expenseSchema>;

// --- Settling up ------------------------------------------------------------

export const settlementInput = z
  .object({
    fromUserId: id,
    toUserId: id,
    amount: minorAmountSchema,
    currency: currencySchema,
  })
  .refine((s) => s.fromUserId !== s.toUserId, { message: "Pick two different people", path: ["toUserId"] });
export type SettlementInput = z.input<typeof settlementInput>;

export const settlementSchema = z.object({
  id,
  fromUserId: id,
  toUserId: id,
  amount: z.number().int(),
  currency: currencySchema,
  createdAt: z.string(),
});
export type Settlement = z.infer<typeof settlementSchema>;

export const transferSchema = z.object({ from: id, to: id, amount: z.number().int() });

export const balancesSchema = z.object({
  ledgers: z.array(
    z.object({
      currency: currencySchema,
      balances: z.array(z.object({ userId: id, net: z.number().int() })),
      /** The fewest payments that settle this currency. */
      plan: z.array(transferSchema),
    }),
  ),
  settlements: z.array(settlementSchema),
});
export type BalancesResponse = z.infer<typeof balancesSchema>;

// --- Activity and invites ---------------------------------------------------

export const ACTIVITY_KINDS = [
  "group.created",
  "member.joined",
  "expense.added",
  "expense.updated",
  "expense.deleted",
  "settlement.recorded",
  "invite.created",
] as const;

export const activitySchema = z.object({
  id,
  kind: z.enum(ACTIVITY_KINDS),
  actorId: id,
  actorName: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

export const inviteSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type Invite = z.infer<typeof inviteSchema>;

export const invitePreviewSchema = z.object({
  groupId: id,
  groupName: z.string(),
  memberCount: z.number().int(),
  invitedBy: z.string(),
  alreadyMember: z.boolean(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** Error body returned by every failing endpoint. */
export const apiErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
