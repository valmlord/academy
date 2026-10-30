import type { Database } from "@academy/db";
import { InvalidAuthSecretError, readAuthSecret } from "./auth/env";
import { dbErrorCode, describeDbError } from "./db-error";
import { InvalidSeedInputError, SeedConflictError, type SeedInput, type SeedResult } from "./seed";
import { connectHint } from "./startup";

// The `pnpm seed` command (ADR-0008 item 10): reads the environment, runs the seed, prints exactly one
// line (L5) and returns the exit code. It never prints the email, the password or the URL.

export interface SeedCliDeps {
  env: Record<string, string | undefined>;
  createDb: (url: string) => { db: Database; close: () => Promise<void> };
  seed: (target: { db: Database; secret: string }, input: SeedInput) => Promise<SeedResult>;
  log: (line: string) => void;
}

// Codes of a database that is down, unreachable or refuses the credentials of DATABASE_URL.
const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "28P01",
  "3D000",
  "57P03",
]);
// undefined_table: the migrations have not run, and only web applies them.
const MISSING_TABLE_CODE = "42P01";
const MISSING_TABLES_HINT =
  "the tables are missing: start the stack first (docker compose up -d --build --wait), web applies the migrations";

export async function runSeed(deps: SeedCliDeps): Promise<number> {
  let secret: string;
  try {
    secret = readAuthSecret({
      BETTER_AUTH_SECRET: deps.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_SECRETS: deps.env.BETTER_AUTH_SECRETS,
    });
  } catch (error: unknown) {
    deps.log(`seed: ${failureLine(error)}`);
    return 1;
  }
  let handle: ReturnType<SeedCliDeps["createDb"]> | undefined;
  try {
    handle = deps.createDb(deps.env.DATABASE_URL ?? "");
    const input = {
      email: deps.env.SEED_EMAIL,
      password: deps.env.SEED_PASSWORD,
      name: deps.env.SEED_NAME,
    };
    deps.log(`seed: ${await deps.seed({ db: handle.db, secret }, input)}`);
    return 0;
  } catch (error: unknown) {
    deps.log(`seed: ${failureLine(error)}`);
    return 1;
  } finally {
    // An open pool would keep the process alive after the line is printed.
    await handle?.close();
  }
}

function failureLine(error: unknown): string {
  // Their messages name variables and rules only, never values.
  if (
    error instanceof InvalidAuthSecretError ||
    error instanceof InvalidSeedInputError ||
    error instanceof SeedConflictError
  ) {
    return `${error.name}: ${error.message}`;
  }
  return `${describeDbError(error)}${hintFor(dbErrorCode(error))}`;
}

// A hint only where it points at the right layer (the #1 lesson): any other code gets none.
function hintFor(code: string | undefined): string {
  if (code === undefined) return "";
  if (CONNECT_CODES.has(code)) return `; ${connectHint}`;
  if (code === MISSING_TABLE_CODE) return `; ${MISSING_TABLES_HINT}`;
  return "";
}
