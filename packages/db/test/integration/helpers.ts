import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { expect, inject } from "vitest";
import { MIGRATIONS_FOLDER } from "../../src/migrate.js";
import { inspected } from "../assertions.js";

export interface FreshDatabase {
  url: string;
  drop(): Promise<void>;
}

export interface SqlState {
  code: string;
  constraint: string | undefined;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

async function withClient<T>(url: string, action: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

/** An empty database in the shared container; its URL carries the canary password. */
export async function freshDatabase(): Promise<FreshDatabase> {
  const adminUrl = inject("postgresUrl");
  const name = `t_${randomBytes(6).toString("hex")}`;
  // The name is generated hex, never input, so it is safe as an identifier.
  await withClient(adminUrl, (admin) => admin.query(`CREATE DATABASE ${name}`));
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      await withClient(adminUrl, (admin) => admin.query(`DROP DATABASE ${name} WITH (FORCE)`));
    },
  };
}

/** Runs one statement on its own short-lived connection and returns the rows. */
export async function queryRows(
  url: string,
  text: string,
  values: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  return withClient(url, async (client) => (await client.query(text, values)).rows);
}

/** Opens a connection the test controls (lock holder, raw inserts); the caller ends it. */
export async function openClient(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** The SQLSTATE and constraint of the pg error in the cause chain (Drizzle wraps driver errors). */
export function sqlState(error: unknown): SqlState {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    if ("code" in current && typeof current.code === "string" && SQLSTATE.test(current.code)) {
      const constraint =
        "constraint" in current && typeof current.constraint === "string"
          ? current.constraint
          : undefined;
      return { code: current.code, constraint };
    }
    current = "cause" in current ? current.cause : undefined;
  }
  throw new Error("no SQLSTATE in the cause chain", { cause: error });
}

/** Awaits the operation and returns the SQLSTATE it failed with; fails if it succeeded. */
export async function failureOf(operation: Promise<unknown>): Promise<SqlState> {
  try {
    await operation;
  } catch (error: unknown) {
    return sqlState(error);
  }
  throw new Error("expected the statement to fail");
}

export function expectNoSecret(value: unknown, secret: string): void {
  expect(inspected(value)).not.toContain(secret);
}

export function journalEntryCount(): number {
  const journal: unknown = JSON.parse(
    readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"),
  );
  if (
    typeof journal !== "object" ||
    journal === null ||
    !("entries" in journal) ||
    !Array.isArray(journal.entries)
  ) {
    throw new Error("meta/_journal.json has no entries array");
  }
  return journal.entries.length;
}

/** The canary password global-setup gave the container, read back from the URL it provided. */
export function testPassword(): string {
  const password = decodeURIComponent(new URL(inject("postgresUrl")).password);
  if (!password.startsWith("canary-")) {
    throw new Error("the test container must run with a canary password");
  }
  return password;
}
