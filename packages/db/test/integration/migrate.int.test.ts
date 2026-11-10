import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { MigrationError } from "../../src/errors.js";
import { MIGRATION_LOCK_KEY, MIGRATIONS_FOLDER, migrateDatabase } from "../../src/migrate.js";
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
  "check_closures",
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

const PRE_101_MIGRATIONS = ["0000_init", "0001_auth"];
// The columns 0002_check_limits adds, left out when a row is compared across the upgrade.
const COLUMNS_OF_101 = [
  "included_check_ids",
  "included_check_kinds",
  "is_format_error",
  "is_budget_exhausted",
  "message",
  "raw_error",
];
const SEEDED_TABLES = ["users", "enrollments", "lesson_progress", "attempts", "check_results"];

/** A migrations folder holding only the migrations merged before #101, with their journal. */
async function pre101MigrationsFolder(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), "academy-pre-101-"));
  await mkdir(path.join(folder, "meta"));
  for (const tag of PRE_101_MIGRATIONS) {
    await copyFile(path.join(MIGRATIONS_FOLDER, `${tag}.sql`), path.join(folder, `${tag}.sql`));
  }
  const journal: unknown = JSON.parse(
    await readFile(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
  );
  if (
    typeof journal !== "object" ||
    journal === null ||
    !("entries" in journal) ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error("meta/_journal.json has no entries array");
  }
  const entries = journal.entries.slice(0, PRE_101_MIGRATIONS.length);
  await writeFile(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  return folder;
}

/** Every row of the seeded tables as jsonb text (timestamps as text), without the #101 columns. */
async function seededRows(url: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const table of SEEDED_TABLES) {
    // The table names are the constants above, never input.
    rows.push(
      ...(await queryRows(
        url,
        `SELECT '${table}' AS source, (to_jsonb(t) - $1::text[])::text AS row FROM ${table} t ORDER BY 2`,
        [COLUMNS_OF_101],
      )),
    );
  }
  return rows;
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

  it("I-upgrade adds the #101 columns to existing rows and leaves their data unchanged", async () => {
    const url = await database();
    const folder = await pre101MigrationsFolder();
    try {
      await migrateDatabase(url, { migrationsFolder: folder });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
    await queryRows(
      url,
      "INSERT INTO users (id, name, email) VALUES ('u-up', 'Learner', 'u-up@example.invalid')",
    );
    await queryRows(url, "INSERT INTO enrollments (user_id, course_id) VALUES ('u-up', 'c')");
    await queryRows(
      url,
      `INSERT INTO lesson_progress (user_id, course_id, lesson_id, status, completed_at)
       VALUES ('u-up', 'c', 'open', 'in-progress', NULL), ('u-up', 'c', 'done', 'completed', now())`,
    );
    const [attempt] = await queryRows(
      url,
      `INSERT INTO attempts (user_id, course_id, lesson_id, status, finished_at)
       VALUES ('u-up', 'c', 'done', 'passed', now()) RETURNING id`,
    );
    await queryRows(
      url,
      `INSERT INTO check_results (attempt_id, check_id, check_kind, status, cost_usd)
       VALUES ($1, 'a', 'command', 'passed', '0.5'), ($1, 'b', 'quiz', 'failed', NULL)`,
      [attempt?.id],
    );
    const before = await seededRows(url);

    await migrateDatabase(url);

    expect(await seededRows(url)).toEqual(before);
    expect(
      await queryRows(
        url,
        "SELECT is_format_error, is_budget_exhausted, message, raw_error FROM check_results",
      ),
    ).toEqual([
      { is_format_error: false, is_budget_exhausted: false, message: null, raw_error: null },
      { is_format_error: false, is_budget_exhausted: false, message: null, raw_error: null },
    ]);
    expect(
      await queryRows(
        url,
        "SELECT included_check_ids::text AS ids, included_check_kinds::text AS kinds FROM attempts",
      ),
    ).toEqual([{ ids: "{}", kinds: "{}" }]);
    expect(await journalRows(url)).toHaveLength(PRE_101_MIGRATIONS.length + 1);
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
