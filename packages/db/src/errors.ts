/**
 * Error types of @academy/db. No message or cause built here ever contains a connection string or
 * any part of its userinfo (ADR-0007, rule 4.11), and the option errors never serialize caller data.
 */

/** Thrown before any I/O when a connection string is not a postgres:// or postgresql:// URL. */
export class InvalidConnectionStringError extends Error {
  constructor() {
    // Fixed text and no cause: the input may carry a password, and a URL parse error may hold it too.
    super("connection string must be a postgres:// or postgresql:// URL");
    this.name = "InvalidConnectionStringError";
  }
}

export class InvalidLockTimeoutError extends Error {
  constructor(value: unknown, maximum: number) {
    // typeof never throws and never echoes caller data; JSON.stringify throws for a BigInt.
    const received = typeof value === "number" ? String(value) : `a value of type ${typeof value}`;
    super(`lockTimeoutMs must be an integer from 1 to ${maximum}, got ${received}`);
    this.name = "InvalidLockTimeoutError";
  }
}

export class InvalidMigrationsFolderError extends Error {
  constructor(value: unknown) {
    // A folder path is not a secret, so a string value is shown as is.
    const received = typeof value === "string" ? value : `a value of type ${typeof value}`;
    super(`migrationsFolder must be an absolute path, got ${received}`);
    this.name = "InvalidMigrationsFolderError";
  }
}

/** Thrown at schema load when a vocabulary value could inject SQL into a CHECK constraint. */
export class InvalidVocabularyValueError extends Error {
  readonly value: string;
  readonly constraint: string;

  constructor(value: string, constraint: string, pattern: RegExp) {
    super(
      `vocabulary value ${JSON.stringify(value)} in constraint ${constraint} must match ${pattern.source}`,
    );
    this.name = "InvalidVocabularyValueError";
    this.value = value;
    this.constraint = constraint;
  }
}

/** Which part of migrateDatabase failed: the network/session, the advisory lock, or the SQL. */
export type MigrationStage = "connect" | "lock" | "apply";

export class MigrationError extends Error {
  readonly stage: MigrationStage;

  constructor(stage: MigrationStage, message: string, cause: unknown) {
    super(message, { cause });
    this.name = "MigrationError";
    this.stage = stage;
  }
}
