import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "./schema";

export { schema };

/** Either driver; both expose the same Postgres query builder. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  /** False for the in-memory PGlite fallback, whose data disappears on restart. */
  persistent: boolean;
  close(): Promise<void>;
}

const sourceMigrations = fileURLToPath(new URL("../../drizzle", import.meta.url));

export interface CreateDbOptions {
  url?: string | undefined;
  /** Where the SQL migrations live; bundles ship them next to the bundle. */
  migrationsFolder?: string;
}

/**
 * Connects to Postgres when a URL is given, otherwise starts an in-memory
 * PGlite (real Postgres compiled to WebAssembly), then applies migrations.
 */
export async function createDb({ url, migrationsFolder = sourceMigrations }: CreateDbOptions = {}): Promise<Database> {
  if (url) {
    const client = postgres(url, { max: 5, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    await migratePostgres(db, { migrationsFolder });
    return { db: db as unknown as Db, persistent: true, close: () => client.end() };
  }
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, persistent: false, close: () => client.close() };
}
