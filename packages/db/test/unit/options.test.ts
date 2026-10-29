import { describe, expect, it } from "vitest";
import { createDb } from "../../src/client.js";
import {
  InvalidConnectionStringError,
  InvalidLockTimeoutError,
  InvalidMigrationsFolderError,
  MigrationError,
} from "../../src/errors.js";
import {
  type MigrateOptions,
  migrateDatabase,
  validateLockTimeoutMs,
  validateMigrationsFolder,
} from "../../src/migrate.js";
import { causeCodes, inspected, rejectionOf, thrownBy } from "../assertions.js";

// Port 1 refuses connections, so anything that gets past validation fails at stage `connect`.
const REFUSING_URL_U4 = "postgres://u:canary-u4@127.0.0.1:1/x";
const REFUSING_URL_U5 = "postgres://u:canary-u5@127.0.0.1:1/x";
const REFUSING_URL_U7 = "postgres://u:canary-u7@127.0.0.1:1/x";

describe("U4 lockTimeoutMs validation", () => {
  const rejectedNumbers = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, 2_147_483_648];

  for (const value of rejectedNumbers) {
    it(`rejects ${String(value)} with InvalidLockTimeoutError before connecting`, async () => {
      const promise = migrateDatabase(REFUSING_URL_U4, { lockTimeoutMs: value });

      const error = await rejectionOf(promise, InvalidLockTimeoutError);

      expect(error.message).toContain(`got ${String(value)}`);
    });
  }

  it("rejects the string 500 naming only its type", async () => {
    // @ts-expect-error the validator must reject non-numbers from untyped callers
    const options: MigrateOptions = { lockTimeoutMs: "500" };

    const error = await rejectionOf(
      migrateDatabase(REFUSING_URL_U4, options),
      InvalidLockTimeoutError,
    );

    expect(error.message).toContain("got a value of type string");
  });

  it("rejects a bigint naming only its type", async () => {
    // @ts-expect-error the validator must reject non-numbers from untyped callers
    const options: MigrateOptions = { lockTimeoutMs: 10n };

    const error = await rejectionOf(
      migrateDatabase(REFUSING_URL_U4, options),
      InvalidLockTimeoutError,
    );

    expect(error.message).toContain("got a value of type bigint");
  });

  for (const value of [1, 60_000, 2_147_483_647]) {
    it(`accepts ${value} unchanged`, () => {
      expect(validateLockTimeoutMs(value)).toBe(value);
    });
  }
});

describe("U5 connect stage", () => {
  it("rejects a refused connection as stage connect without the password", async () => {
    const error = await rejectionOf(migrateDatabase(REFUSING_URL_U5), MigrationError);

    expect(error.stage).toBe("connect");
    expect(causeCodes(error)).toContain("ECONNREFUSED");
    expect(inspected(error)).not.toContain("canary-u5");
  });

  it("rejects a missing sslrootcert file as stage connect without the password", async () => {
    // Passes the URL pre-check; the pg.Client constructor reads the file synchronously and throws.
    const url = `${REFUSING_URL_U5}?sslrootcert=/nonexistent-academy-28/root.crt`;

    const error = await rejectionOf(migrateDatabase(url), MigrationError);

    expect(error.stage).toBe("connect");
    expect(causeCodes(error)).toContain("ENOENT");
    expect(inspected(error)).not.toContain("canary-u5");
  });
});

describe("U6 malformed connection strings", () => {
  const malformed = ["postgres://u:canary-u6@[bad", "mysql://u:canary-u6@h/x"];

  for (const url of malformed) {
    it(`createDb rejects ${url} without echoing it`, () => {
      const error = thrownBy(() => createDb(url), InvalidConnectionStringError);

      expect(error.cause).toBeUndefined();
      expect(inspected(error)).not.toContain("canary-u6");
    });

    it(`migrateDatabase rejects ${url} without echoing it`, async () => {
      const error = await rejectionOf(migrateDatabase(url), InvalidConnectionStringError);

      expect(error.cause).toBeUndefined();
      expect(inspected(error)).not.toContain("canary-u6");
    });
  }

  it("createDb rejects an empty string", () => {
    expect(() => createDb("")).toThrow(InvalidConnectionStringError);
  });
});

describe("U7 migrationsFolder validation", () => {
  for (const folder of ["drizzle", "./drizzle"]) {
    it(`rejects the relative folder ${folder} and names it`, async () => {
      const promise = migrateDatabase(REFUSING_URL_U7, { migrationsFolder: folder });

      const error = await rejectionOf(promise, InvalidMigrationsFolderError);

      expect(error.message).toContain(`got ${folder}`);
    });
  }

  it("passes an absolute folder through unchanged", () => {
    expect(validateMigrationsFolder("/srv/app/drizzle")).toBe("/srv/app/drizzle");
  });
});
