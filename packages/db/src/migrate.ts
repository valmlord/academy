import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { assertPostgresUrl } from "./connection-string.js";
import {
  InvalidLockTimeoutError,
  InvalidMigrationsFolderError,
  MigrationError,
  type MigrationStage,
} from "./errors.js";

/**
 * The generated `drizzle/` folder of this package, absolute. Right under plain Node from `src/` and
 * from `dist/` (same depth). A bundler (Next.js without `serverExternalPackages`) rewrites
 * `import.meta.url`, so a bundled consumer passes its own absolute `migrationsFolder` instead.
 */
export const MIGRATIONS_FOLDER: string = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Key of the session-level advisory lock that serializes concurrent migrateDatabase calls
 * ("acad" in ASCII). It must never change: old and new code would stop excluding each other.
 */
export const MIGRATION_LOCK_KEY = 0x61636164;

/** The v1 schema migrates in well under a second; 60 s tolerates a slow first start and turns a
 * stuck peer into an error instead of a silent hang. */
export const MIGRATION_LOCK_TIMEOUT_MS = 60_000;

/** The largest value Postgres accepts for an integer setting such as lock_timeout (2^31 - 1). */
export const MAX_LOCK_TIMEOUT_MS = 2_147_483_647;

const LOCK_NOT_AVAILABLE = "55P03";
// Bounds the cause-chain walk, so a cyclic `cause` cannot loop forever.
const MAX_CAUSE_DEPTH = 10;

export interface MigrateOptions {
  /** Absolute path of a drizzle-kit migrations folder. Defaults to MIGRATIONS_FOLDER. */
  migrationsFolder?: string;
  /** How long to wait for the migration lock, 1 to MAX_LOCK_TIMEOUT_MS. */
  lockTimeoutMs?: number;
}

/** Returns the value if it is a safe integer from 1 to MAX_LOCK_TIMEOUT_MS. 0 would disable the timeout. */
export function validateLockTimeoutMs(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_LOCK_TIMEOUT_MS
  ) {
    throw new InvalidLockTimeoutError(value, MAX_LOCK_TIMEOUT_MS);
  }
  return value;
}

/** Returns the value if it is an absolute path; Drizzle would resolve a relative one against the cwd. */
export function validateMigrationsFolder(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new InvalidMigrationsFolderError(value);
  }
  return value;
}

/**
 * Applies pending migrations on one connection under a Postgres advisory lock. Option and URL errors
 * are thrown before any I/O; a failure after that is a MigrationError naming the stage.
 */
export async function migrateDatabase(
  connectionString: string,
  options: MigrateOptions = {},
): Promise<void> {
  assertPostgresUrl(connectionString);
  const lockTimeoutMs =
    options.lockTimeoutMs === undefined
      ? MIGRATION_LOCK_TIMEOUT_MS
      : validateLockTimeoutMs(options.lockTimeoutMs);
  const migrationsFolder =
    options.migrationsFolder === undefined
      ? MIGRATIONS_FOLDER
      : validateMigrationsFolder(options.migrationsFolder);

  let client: pg.Client | undefined;
  let stage: MigrationStage = "connect";
  try {
    // Inside the try: the constructor parses the URL and synchronously reads any sslcert, sslkey or
    // sslrootcert file it names, so a missing file is a connect-stage MigrationError, not a raw throw.
    client = new pg.Client({ connectionString, application_name: "academy-migrate" });
    await client.connect();
    // A bind parameter, never SET (which takes none). is_local = false keeps it for the session;
    // true would expire with this statement's implicit transaction, before the lock call.
    await client.query("SELECT set_config('lock_timeout', $1, false)", [String(lockTimeoutMs)]);
    stage = "lock";
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    stage = "apply";
    await migrate(drizzle(client), { migrationsFolder });
  } catch (error: unknown) {
    throw new MigrationError(
      stage,
      migrationMessage(stage, errorCode(error), lockTimeoutMs, migrationsFolder),
      error,
    );
  } finally {
    // Ending the session also releases the advisory lock, so no explicit unlock is needed.
    await client?.end();
  }
}

function migrationMessage(
  stage: MigrationStage,
  code: string,
  lockTimeoutMs: number,
  migrationsFolder: string,
): string {
  switch (stage) {
    case "connect":
      return `could not open the migration session (${code})`;
    case "lock":
      // The hint is only true for a lock timeout, not e.g. for a session terminated during the wait.
      return code === LOCK_NOT_AVAILABLE
        ? `could not acquire the migration lock within ${lockTimeoutMs} ms (${code}): another migrateDatabase may hold it`
        : `failed while waiting for the migration lock (${code})`;
    case "apply":
      return `applying migrations from ${migrationsFolder} failed (${code}); no migration from this run was applied`;
  }
}

/** The first SQLSTATE or Node error code in the cause chain, or "unknown". */
function errorCode(error: unknown): string {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && typeof current === "object" && current !== null;
    depth++
  ) {
    if ("code" in current && typeof current.code === "string" && current.code !== "") {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return "unknown";
}
