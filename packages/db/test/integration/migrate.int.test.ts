import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MigrationError } from "../../src/errors.js";
import { MIGRATION_LOCK_KEY, migrateDatabase } from "../../src/migrate.js";
import { causeCodes, rejectionOf } from "../assertions.js";
import {
  expectNoSecret,
  type FreshDatabase,
  freshDatabase,
  journalEntryCount,
  openClient,
  queryRows,
  testPassword,
} from "./helpers.js";

const BROKEN_MIGRATIONS = fileURLToPath(new URL("./fixtures/broken-migrations", import.meta.url));
const SCHEMA_TABLES = [
  "accounts",
  "attempts",
  "check_results",
  "enrollments",
  "lesson_progress",
  "mentor_reviews",
  "sessions",
  "users",
  "verifications",
];
const LOCK_WAIT_POLL_MS = 100;
const LOCK_WAIT_LIMIT_MS = 10_000;

let databases: FreshDatabase[] = [];

async function database(): Promise<string> {
  const created = await freshDatabase();
  databases.push(created);
  return created.url;
}

afterEach(async () => {
  await Promise.all(databases.map((created) => created.drop()));
  databases = [];
});

async function journalRows(url: string): Promise<Record<string, unknown>[]> {
  return queryRows(
    url,
    "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id",
  );
}

async function tableExists(url: string, name: string): Promise<boolean> {
  const rows = await queryRows(url, "SELECT to_regclass($1) IS NOT NULL AS present", [name]);
  return rows[0]?.present === true;
}

/** Waits until a migrateDatabase session is seen waiting for an advisory lock in the catalog. */
async function waitForLockWaiter(url: string): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    const rows = await queryRows(
      url,
      `SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
       WHERE l.locktype = 'advisory' AND NOT l.granted
         AND a.application_name = 'academy-migrate' AND a.datname = current_database()`,
    );
    if (rows.length > 0) {
      return;
    }
    await sleep(LOCK_WAIT_POLL_MS);
  }
  throw new Error("migrateDatabase did not wait for the migration lock");
}

describe("migrateDatabase", () => {
  it("I1 creates every schema table on an empty database and records every journal entry", async () => {
    const url = await database();

    await migrateDatabase(url);

    const tables = await queryRows(
      url,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1",
    );
    expect(tables.map((row) => row.table_name)).toEqual(SCHEMA_TABLES);
    expect(await journalRows(url)).toHaveLength(journalEntryCount());
  });

  it("I2 leaves the journal untouched when run again", async () => {
    const url = await database();
    await migrateDatabase(url);
    const before = await journalRows(url);

    await migrateDatabase(url);

    expect(await journalRows(url)).toEqual(before);
  });

  it("I3 waits for the migration lock held by another session", async () => {
    const url = await database();
    const holder = await openClient(url);
    await holder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    const migration = migrateDatabase(url);
    try {
      await waitForLockWaiter(url);
      expect(await tableExists(url, "drizzle.__drizzle_migrations")).toBe(false);
    } finally {
      await holder.end();
    }
    await migration;

    expect(await journalRows(url)).toHaveLength(journalEntryCount());
  });

  it("I4 rolls back a failing migration, names the stage and releases the lock", async () => {
    const url = await database();

    const error = await rejectionOf(
      migrateDatabase(url, { migrationsFolder: BROKEN_MIGRATIONS }),
      MigrationError,
    );

    expect(error.stage).toBe("apply");
    expect(error.message).toContain(BROKEN_MIGRATIONS);
    expect(error.message).toContain("22012");
    expect(error.message).toContain("no migration from this run was applied");
    expect(await tableExists(url, "public.broken_probe")).toBe(false);
    expect(await journalRows(url)).toHaveLength(0);
    expectNoSecret(error, testPassword());
    await expect(migrateDatabase(url, { lockTimeoutMs: 2_000 })).resolves.toBeUndefined();
  });

  it("I5 turns a held lock into a lock-stage error after lockTimeoutMs", async () => {
    const url = await database();
    const holder = await openClient(url);
    await holder.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    try {
      const error = await rejectionOf(migrateDatabase(url, { lockTimeoutMs: 500 }), MigrationError);

      expect(error.stage).toBe("lock");
      expect(error.message).toContain("within 500 ms");
      expect(error.message).not.toContain("no migration from this run was applied");
      expect(causeCodes(error)).toContain("55P03");
      expectNoSecret(error, testPassword());
    } finally {
      await holder.end();
    }
  });

  it("I12 reports a wrong password as stage connect without either password", async () => {
    const url = new URL(await database());
    url.password = "wrong-canary-28";

    const error = await rejectionOf(migrateDatabase(url.toString()), MigrationError);

    expect(error.stage).toBe("connect");
    expect(causeCodes(error)).toContain("28P01");
    expectNoSecret(error, "wrong-canary-28");
    expectNoSecret(error, testPassword());
  });
});
