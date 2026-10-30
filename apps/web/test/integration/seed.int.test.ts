import { createDb } from "@academy/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeDbError } from "@/lib/db-error";
import { InvalidSeedInputError, SeedConflictError, seedUser } from "@/lib/seed";
import { serialised } from "@/test/serialised";
import { authRequest, sessionCookieOf, signIn, testAuth } from "./auth";
import { type TestDatabase, testDatabase } from "./db";

const EMAIL = "learner@example.com";
const PASSWORD = "canary-seed-password-1";
const NEW_PASSWORD = "canary-seed-password-2";

let database: TestDatabase | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await database?.drop();
  database = undefined;
});

async function count(db: TestDatabase, table: string): Promise<unknown> {
  return (await db.rows(`SELECT count(*)::int AS n FROM ${table}`))[0]?.n;
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("expected the seed to fail");
}

async function seeded() {
  database = await testDatabase();
  const { auth, sink } = testAuth(database);
  const consoleSpies = (["error", "warn", "log", "info"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  );
  const printed = (): string =>
    serialised([...sink.mock.calls, ...consoleSpies.flatMap((spy) => spy.mock.calls)]);
  return { db: database, auth, ctx: await auth.$context, printed };
}

describe("I-seed: create, re-key and refuse", () => {
  it("(1) creates the user lowercased with a hashed credential account", async () => {
    const { db, ctx } = await seeded();

    const result = await seedUser(ctx, {
      email: "Learner@Example.COM",
      password: PASSWORD,
      name: undefined,
    });

    expect(result).toBe("created");
    expect(await db.rows(`SELECT email FROM users`)).toEqual([{ email: EMAIL }]);
    const accounts = await db.rows(`SELECT provider_id, password FROM accounts`);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.provider_id).toBe("credential");
    expect(accounts[0]?.password).not.toBe(PASSWORD);
    expect(String(accounts[0]?.password)).not.toContain(PASSWORD);
  });

  it("(2, 3) re-keys the password of the existing user and ends its sessions", async () => {
    const { db, auth, ctx, printed } = await seeded();
    await seedUser(ctx, { email: EMAIL, password: PASSWORD, name: undefined });
    const signedIn = await signIn(auth, EMAIL, PASSWORD);
    expect(signedIn.status).toBe(200);
    const oldCookie = sessionCookieOf(signedIn);

    const result = await seedUser(ctx, { email: EMAIL, password: NEW_PASSWORD, name: undefined });

    expect(result).toBe("updated");
    expect(await count(db, "users")).toBe(1);
    expect((await signIn(auth, EMAIL, PASSWORD)).status).toBe(401);
    expect((await signIn(auth, EMAIL, NEW_PASSWORD)).status).toBe(200);
    const oldSession = await auth.handler(authRequest("/get-session", { cookie: oldCookie }));
    expect(await oldSession.json()).toBeNull();
    expect(printed()).not.toContain(NEW_PASSWORD);
  });

  it("(4) refuses a second user and writes nothing", async () => {
    const { db, ctx } = await seeded();
    await seedUser(ctx, { email: EMAIL, password: PASSWORD, name: undefined });

    const error = await rejectionOf(
      seedUser(ctx, { email: "other@example.com", password: PASSWORD, name: undefined }),
    );

    expect(error).toBeInstanceOf(SeedConflictError);
    expect([await count(db, "users"), await count(db, "accounts")]).toEqual([1, 1]);
  });
});

describe("I-seed: invalid input, missing tables, a half-written state and a stopped database", () => {
  it.each([
    {
      kind: "a 7-character password",
      email: EMAIL,
      password: "1234567",
      variable: "SEED_PASSWORD",
    },
    {
      kind: "a 129-character password",
      email: EMAIL,
      password: "p".repeat(129),
      variable: "SEED_PASSWORD",
    },
    { kind: "an empty email", email: "", password: PASSWORD, variable: "SEED_EMAIL" },
  ])(
    "(5) refuses $kind, naming $variable, and writes nothing",
    async ({ email, password, variable }) => {
      const { db, ctx } = await seeded();

      const error = await rejectionOf(seedUser(ctx, { email, password, name: undefined }));

      expect(error).toBeInstanceOf(InvalidSeedInputError);
      expect(error instanceof Error ? error.message : "").toContain(variable);
      expect(await count(db, "users")).toBe(0);
    },
  );

  it("(6) fails with 42P01 on a database without the migrations", async () => {
    database = await testDatabase({ migrated: false });
    const { auth } = testAuth(database);

    const error = await rejectionOf(
      seedUser(await auth.$context, { email: EMAIL, password: PASSWORD, name: undefined }),
    );

    expect(describeDbError(error)).toContain("42P01");
  });

  it("(7) repairs a user left without its credential account and ends its sessions", async () => {
    const { db, auth, ctx, printed } = await seeded();
    const user = await ctx.internalAdapter.createUser(
      { email: EMAIL, name: "Learner", emailVerified: false },
      { method: "email-password" },
    );
    await db.rows(
      `INSERT INTO sessions (id, token, user_id, expires_at)
       VALUES ('half-written', 'half-written-token', '${user.id}', now() + interval '1 day')`,
    );

    const result = await seedUser(ctx, { email: EMAIL, password: PASSWORD, name: undefined });

    expect(await count(db, "accounts WHERE provider_id = 'credential'")).toBe(1);
    expect((await signIn(auth, EMAIL, PASSWORD)).status).toBe(200);
    expect(result).toBe("repaired");
    expect(await count(db, "sessions WHERE id = 'half-written'")).toBe(0);
    expect(printed()).not.toContain(PASSWORD);
    expect(printed()).not.toContain(EMAIL);
  });

  it("(8) fails with ECONNREFUSED when the database is down", async () => {
    const handle = createDb("postgres://academy:canary-down@127.0.0.1:1/academy");
    try {
      const { auth } = testAuth({
        url: "",
        db: handle.db,
        rows: async () => [],
        drop: async () => {},
      });

      const error = await rejectionOf(
        seedUser(await auth.$context, { email: EMAIL, password: PASSWORD, name: undefined }),
      );

      expect(describeDbError(error)).toContain("ECONNREFUSED");
    } finally {
      await handle.close();
    }
  });
});
