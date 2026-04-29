import type { ACTIVITY_KINDS } from "@split-ledger/shared";

import { schema, type Db } from "../db";

export interface ActivityEntry {
  groupId: string;
  actorId: string;
  kind: (typeof ACTIVITY_KINDS)[number];
  summary: string;
  data?: Record<string, unknown>;
}

/** Appends to a group's activity log. Call inside the same transaction as the change it records. */
export async function logActivity(db: Db, entry: ActivityEntry) {
  await db.insert(schema.activity).values({ ...entry, data: entry.data ?? {} });
}
