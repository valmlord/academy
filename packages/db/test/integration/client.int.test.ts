import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, type DbHandle } from "../../src/client.js";
import { inspected } from "../assertions.js";
import { type FreshDatabase, freshDatabase, queryRows, testPassword } from "./helpers.js";

const POOL_ERROR_WAIT_MS = 5_000;
const POLL_MS = 50;

let databases: FreshDatabase[] = [];
let handles: DbHandle[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(handles.map((handle) => handle.close()));
  await Promise.all(databases.map((created) => created.drop()));
  handles = [];
  databases = [];
});

async function database(): Promise<string> {
  const created = await freshDatabase();
  databases.push(created);
  return created.url;
}

/** Terminates every other session of the test database, as a server restart would. */
async function terminateOtherSessions(url: string): Promise<void> {
  await queryRows(
    url,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
}

/** A string as console prints it; anything else fully inspected, so a secret in an object shows. */
function loggedArgument(argument: unknown): string {
  return typeof argument === "string" ? argument : inspected(argument);
}

async function waitUntil(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + POOL_ERROR_WAIT_MS;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await sleep(POLL_MS);
  }
}

describe("createDb pool errors", () => {
  it("I8 survives a terminated idle connection and reports it to onPoolError", async () => {
    const url = await database();
    const poolErrors: Error[] = [];
    const handle = createDb(url, { onPoolError: (error) => poolErrors.push(error) });
    handles.push(handle);
    await handle.db.execute(sql`SELECT 1`);

    await terminateOtherSessions(url);
    await waitUntil(() => poolErrors.length > 0, "onPoolError");

    const result = await handle.db.execute(sql`SELECT 1 AS alive`);
    expect(result.rows).toEqual([{ alive: 1 }]);
  });

  it("I8b logs one line with the code and no connection string by default", async () => {
    const url = await database();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handle = createDb(url);
    handles.push(handle);
    await handle.db.execute(sql`SELECT 1`);

    await terminateOtherSessions(url);
    await waitUntil(() => consoleError.mock.calls.length > 0, "the default pool error log");

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls.flat().map(loggedArgument).join(" ");
    expect(logged).toContain("@academy/db: idle pool client error");
    expect(logged).toContain("57P01");
    expect(logged).not.toContain(testPassword());
    expect(logged).not.toContain(url);
  });
});
