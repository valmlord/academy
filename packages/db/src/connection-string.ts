import { InvalidConnectionStringError } from "./errors.js";

const POSTGRES_PROTOCOLS: ReadonlySet<string> = new Set(["postgres:", "postgresql:"]);

/**
 * Rejects anything but a postgres:// or postgresql:// URL before pg parses it. The thrown error has
 * a fixed message and no cause, because both the input and Node's URL parse error may carry the
 * password (ADR-0007, rule 4.11).
 */
export function assertPostgresUrl(connectionString: unknown): void {
  if (typeof connectionString !== "string" || connectionString === "") {
    throw new InvalidConnectionStringError();
  }
  let protocol: string;
  try {
    protocol = new URL(connectionString).protocol;
  } catch {
    // The parse error is dropped on purpose: attaching it as a cause would leak the input.
    throw new InvalidConnectionStringError();
  }
  if (!POSTGRES_PROTOCOLS.has(protocol)) {
    throw new InvalidConnectionStringError();
  }
}
