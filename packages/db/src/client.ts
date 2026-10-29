import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { assertPostgresUrl } from "./connection-string.js";

export type Database = NodePgDatabase;

export interface CreateDbOptions {
  /** Called when an idle pooled connection fails (e.g. the server restarted); the pool replaces it. */
  onPoolError?: (error: Error) => void;
}

export interface DbHandle {
  db: Database;
  close(): Promise<void>;
}

/**
 * Wraps a pg Pool in Drizzle. Reads no env: the caller decides where the URL comes from. A Pool
 * `error` listener is always registered, because an unhandled `error` event crashes Node when the
 * server terminates an idle connection.
 */
export function createDb(connectionString: string, options: CreateDbOptions = {}): DbHandle {
  assertPostgresUrl(connectionString);
  const pool = new pg.Pool({ connectionString });
  pool.on("error", options.onPoolError ?? logIdlePoolError);
  return { db: drizzle(pool), close: () => pool.end() };
}

// Only the code and message: the error object or the pool config could carry the connection string.
function logIdlePoolError(error: Error): void {
  const code = "code" in error && typeof error.code === "string" ? error.code : "unknown";
  console.error(`@academy/db: idle pool client error (${code}): ${error.message}`);
}
