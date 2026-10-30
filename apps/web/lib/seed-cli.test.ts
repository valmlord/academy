// @vitest-environment node
import type { Database } from "@academy/db";
import { describe, expect, it, vi } from "vitest";
import { serialised } from "@/test/serialised";
import type { SeedResult } from "./seed";
import { runSeed, type SeedCliDeps } from "./seed-cli";
import { connectHint } from "./startup";

const MISSING_TABLES_HINT = "the tables are missing";
const EMAIL = "canary-email@example.com";
const PASSWORD = "canary-password-seed";

function pgError(code: string): Error {
  return Object.assign(new Error(`failed for ${EMAIL} with ${PASSWORD}`), { code });
}

function fakeDeps(seed: SeedCliDeps["seed"], secret = "canary-auth-secret-s".padEnd(32, "x")) {
  const close = vi.fn(async () => {});
  const deps = {
    env: {
      DATABASE_URL: "postgres://academy:canary-url-pw@127.0.0.1:1/academy",
      BETTER_AUTH_SECRET: secret,
      SEED_EMAIL: EMAIL,
      SEED_PASSWORD: PASSWORD,
    },
    // Never queried: the seed fake stands in for everything that would touch it.
    createDb: vi.fn((_url: string) => ({ db: {} as Database, close })),
    seed: vi.fn(seed),
    log: vi.fn((_line: string) => {}),
  };
  return { deps, close };
}

function onlyLine(deps: ReturnType<typeof fakeDeps>["deps"]): string {
  expect(deps.log).toHaveBeenCalledOnce();
  return String(deps.log.mock.calls[0]?.[0]);
}

function expectNoSecrets(deps: ReturnType<typeof fakeDeps>["deps"]): void {
  const printed = serialised(deps.log.mock.calls);
  for (const secret of ["canary-url-pw", EMAIL, PASSWORD]) expect(printed).not.toContain(secret);
}

describe("runSeed", () => {
  it("prints one line and exits 0 when the seed creates the user, closing the pool once", async () => {
    const { deps, close } = fakeDeps(async (): Promise<SeedResult> => "created");

    const code = await runSeed(deps);

    expect(code).toBe(0);
    expect(onlyLine(deps)).toBe("seed: created");
    expect(close).toHaveBeenCalledOnce();
    expectNoSecrets(deps);
  });

  it("adds the connect hint to a refused connection and closes the pool", async () => {
    const { deps, close } = fakeDeps(async () => {
      throw pgError("ECONNREFUSED");
    });

    const code = await runSeed(deps);

    expect(close).toHaveBeenCalledOnce();
    expect(code).toBe(1);
    const line = onlyLine(deps);
    expect(line).toContain("ECONNREFUSED");
    expect(line).toContain(connectHint);
    expect(line).not.toContain(MISSING_TABLES_HINT);
    expectNoSecrets(deps);
  });

  it("adds the missing-tables hint to 42P01 and not the connect hint", async () => {
    const { deps } = fakeDeps(async () => {
      throw pgError("42P01");
    });

    expect(await runSeed(deps)).toBe(1);

    const line = onlyLine(deps);
    expect(line).not.toContain(connectHint);
    expect(line).toContain(MISSING_TABLES_HINT);
    expectNoSecrets(deps);
  });

  it("adds no hint to any other database error", async () => {
    const { deps } = fakeDeps(async () => {
      throw pgError("23505");
    });

    expect(await runSeed(deps)).toBe(1);

    const line = onlyLine(deps);
    expect(line).not.toContain(connectHint);
    expect(line).toBe("seed: Error (23505)");
    expectNoSecrets(deps);
  });

  it("refuses an invalid secret before opening the database", async () => {
    const { deps } = fakeDeps(async (): Promise<SeedResult> => "created", "short");

    expect(await runSeed(deps)).toBe(1);

    expect(deps.createDb).not.toHaveBeenCalled();
    expect(onlyLine(deps)).toContain("InvalidAuthSecretError");
    expectNoSecrets(deps);
  });
});
