import type { Member } from "@split-ledger/shared";
import { and, asc, eq } from "drizzle-orm";

import { schema, type Db } from "../db";
import { notFound, uuidParam } from "../http";

/**
 * The one authorization rule: you can see and change a group only if you
 * are a member. Non-members get the same 404 as a group that doesn't exist,
 * so ids can't be probed.
 */
export async function requireMembership(db: Db, rawGroupId: string | undefined, userId: string) {
  const groupId = uuidParam(rawGroupId, "Group not found");
  const [row] = await db
    .select({ group: schema.groups, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.memberships.groupId))
    .where(and(eq(schema.memberships.groupId, groupId), eq(schema.memberships.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Group not found");
  return row;
}

export async function groupMembers(db: Db, groupId: string): Promise<Member[]> {
  return db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.groupId, groupId))
    .orderBy(asc(schema.memberships.joinedAt), asc(schema.users.name));
}
