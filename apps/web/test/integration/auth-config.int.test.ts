import { afterEach, describe, expect, it } from "vitest";
import {
  authRequest,
  createCredentialUser,
  SESSION_COOKIE,
  sessionCookieOf,
  signIn,
  testAuth,
} from "./auth";
import { type TestDatabase, testDatabase } from "./db";

const EMAIL = "learner@example.com";
const PASSWORD = "correct horse battery";

let database: TestDatabase | undefined;

afterEach(async () => {
  await database?.drop();
  database = undefined;
});

async function userCount(db: TestDatabase): Promise<unknown> {
  return (await db.rows(`SELECT count(*)::int AS n FROM users`))[0]?.n;
}

describe("I-map: Better Auth's schema check accepts the Drizzle schema", () => {
  it("resolves the check and logs no schema mismatch", async () => {
    database = await testDatabase();
    const { auth, sink } = testAuth(database);

    const ctx = await auth.$context;

    expect(typeof ctx.checkSchema).toBe("function");
    await expect(ctx.checkSchema?.()).resolves.toBeUndefined();
    expect(sink.mock.calls.flat().join("\n")).not.toContain("SchemaMismatch");
  });
});

describe("I-signin: email and password sign-in over the handler", () => {
  it("sets an HttpOnly, SameSite=Lax, non-Secure session cookie for correct credentials", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);
    await createCredentialUser(auth, EMAIL, PASSWORD);

    const response = await signIn(auth, EMAIL, PASSWORD);

    expect(response.status).toBe(200);
    const cookie = response.headers.getSetCookie().find((line) => line.includes(SESSION_COOKIE));
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).not.toContain("__Secure-");
    expect(cookie).not.toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/;\s*HttpOnly/i);
    expect(cookie).toMatch(/;\s*SameSite=Lax/i);
  });

  it("answers 401 to a wrong password and to an unknown email", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);
    await createCredentialUser(auth, EMAIL, PASSWORD);

    const wrong = await signIn(auth, EMAIL, "wrong password!");
    const unknown = await signIn(auth, "nobody@example.com", PASSWORD);

    expect([wrong.status, unknown.status]).toEqual([401, 401]);
  });

  it("refuses sign-up without creating a user", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);

    const response = await auth.handler(
      authRequest("/sign-up/email", {
        body: { email: "intruder@example.com", password: PASSWORD, name: "Intruder" },
      }),
    );

    expect(response.ok).toBe(false);
    expect(await userCount(database)).toBe(0);
  });
});

describe("I-rl: the sign-in rate limit is on in every mode", () => {
  it("answers 429 to the fourth attempt within 10 s from one address, and 401 to another address", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);
    await createCredentialUser(auth, EMAIL, PASSWORD);
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await signIn(auth, EMAIL, "wrong password!", { xff: "10.29.0.1" })).status);
    }
    const fourth = await signIn(auth, EMAIL, "wrong password!", { xff: "10.29.0.1" });
    const otherAddress = await signIn(auth, EMAIL, "wrong password!", { xff: "10.29.0.2" });

    expect(statuses).toEqual([401, 401, 401]);
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get("x-retry-after")).toMatch(/^\d+$/);
    expect(otherAddress.status).toBe(401);
  });
});

describe("I-origin: sign-out checks the Origin of a cookie-carrying POST", () => {
  async function sessionRows(db: TestDatabase): Promise<unknown> {
    return (await db.rows(`SELECT count(*)::int AS n FROM sessions`))[0]?.n;
  }

  it("refuses a foreign Origin with 403 and keeps the session", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);
    await createCredentialUser(auth, EMAIL, PASSWORD);
    const cookie = sessionCookieOf(await signIn(auth, EMAIL, PASSWORD));

    const response = await auth.handler(
      authRequest("/sign-out", { method: "POST", cookie, origin: "http://evil.example" }),
    );

    expect(response.status).toBe(403);
    expect(await sessionRows(database)).toBe(1);
  });

  it.each([
    { host: "127.0.0.1:3080", origin: "http://127.0.0.1:3080" },
    { host: "localhost:3000", origin: "http://localhost:3000" },
  ])(
    "signs out a same-origin request from $origin and deletes the session",
    async ({ host, origin }) => {
      database = await testDatabase();
      const { auth } = testAuth(database);
      await createCredentialUser(auth, EMAIL, PASSWORD);
      const cookie = sessionCookieOf(await signIn(auth, EMAIL, PASSWORD, { host, origin }));

      const response = await auth.handler(
        authRequest("/sign-out", { method: "POST", cookie, host, origin }),
      );

      expect(response.status).toBe(200);
      expect(await sessionRows(database)).toBe(0);
    },
  );
});

describe("I-host: a Host outside the loopback patterns is refused before any credential check", () => {
  it("rejects the handler call and creates no session for correct credentials", async () => {
    database = await testDatabase();
    const { auth } = testAuth(database);
    await createCredentialUser(auth, EMAIL, PASSWORD);

    const call = signIn(auth, EMAIL, PASSWORD, {
      host: "evil.example:3080",
      origin: "http://evil.example:3080",
    });

    await expect(call).rejects.toThrow(/is not in the allowed hosts list/);
    expect((await database.rows(`SELECT count(*)::int AS n FROM sessions`))[0]?.n).toBe(0);
  });
});
