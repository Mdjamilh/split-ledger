import { randomBytes } from "node:crypto";

import postgres from "postgres";

import { createDb, type Database } from "../src/db";

/*
 * A fresh, migrated database for one test file. With TEST_DATABASE_URL set
 * (CI's Postgres 17 service) each call creates and later drops a throwaway
 * database on that server; otherwise it is an in-memory PGlite.
 */
export async function testDatabase(): Promise<Database> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) return createDb();

  const name = `split_test_${randomBytes(6).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const database = await createDb({ url: url.toString() });
  return {
    ...database,
    async close() {
      await database.close();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}
