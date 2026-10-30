import { randomBytes } from "node:crypto";
import { createDb, type Database, migrateDatabase } from "@academy/db";
import { inject } from "vitest";

export interface TestDatabase {
  url: string;
  db: Database;
  /** Rows of one raw statement, for assertions on what the app wrote. */
  rows(query: string): Promise<Record<string, unknown>[]>;
  drop(): Promise<void>;
}

async function onAdmin(statement: string): Promise<void> {
  const admin = createDb(inject("postgresUrl"));
  try {
    await admin.db.execute(statement);
  } finally {
    await admin.close();
  }
}

/**
 * A fresh database `db_<random>` in the shared container, migrated unless `migrated` is false. Its URL
 * carries the canary password of global-setup.
 */
export async function testDatabase({ migrated = true } = {}): Promise<TestDatabase> {
  // Generated hex, never input, so it is safe as an identifier.
  const name = `db_${randomBytes(6).toString("hex")}`;
  await onAdmin(`CREATE DATABASE ${name}`);
  const url = new URL(inject("postgresUrl"));
  url.pathname = `/${name}`;
  if (migrated) await migrateDatabase(url.toString());
  const handle = createDb(url.toString());
  return {
    url: url.toString(),
    db: handle.db,
    rows: async (query) => (await handle.db.execute(query)).rows,
    drop: async () => {
      await handle.close();
      await onAdmin(`DROP DATABASE ${name} WITH (FORCE)`);
    },
  };
}
