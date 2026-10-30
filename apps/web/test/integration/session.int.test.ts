import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionReader, SessionReadError } from "@/lib/session-reader";
import { serialised } from "@/test/serialised";
import {
  APP_HOST,
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
const DAY_MS = 24 * 60 * 60 * 1000;

let database: TestDatabase | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await database?.drop();
  database = undefined;
});

/** Headers of a server render: the cookie, plus the Host the dynamic base URL resolves from. */
function renderHeaders(cookie: string): Headers {
  return new Headers({ cookie, host: APP_HOST });
}

async function signedIn() {
  database = await testDatabase();
  const { auth, sink } = testAuth(database);
  await createCredentialUser(auth, EMAIL, PASSWORD);
  const cookie = sessionCookieOf(await signIn(auth, EMAIL, PASSWORD));
  const read = createSessionReader({ getSession: auth.api.getSession });
  return { db: database, auth, sink, cookie, read };
}

/** expires_at of the only session row, in epoch milliseconds (microseconds kept as a fraction). */
async function expiresAtMs(db: TestDatabase): Promise<number> {
  const rows = await db.rows(
    `SELECT (extract(epoch FROM expires_at) * 1000)::float8 AS ms FROM sessions`,
  );
  const value = rows[0]?.ms;
  if (rows.length !== 1 || typeof value !== "number") {
    throw new Error("expected exactly one session row");
  }
  return value;
}

describe("I-dal: the session reader reads the database without refreshing", () => {
  it("returns null for a forged cookie", async () => {
    const { read } = await signedIn();

    expect(await read(renderHeaders(`${SESSION_COOKIE}=forged.value`))).toBeNull();
  });

  it("returns the signed-in user for a valid cookie", async () => {
    const { read, cookie } = await signedIn();

    expect((await read(renderHeaders(cookie)))?.user.email).toBe(EMAIL);
  });

  it("returns null once the session row has expired", async () => {
    const { db, read, cookie } = await signedIn();
    await db.rows(`UPDATE sessions SET expires_at = now() - interval '1 minute'`);

    expect(await read(renderHeaders(cookie))).toBeNull();
  });

  it("leaves expires_at unchanged inside the refresh window", async () => {
    const { db, read, cookie } = await signedIn();
    // Better Auth refreshes once expires_at <= now + 6 d (7 d lifetime, 1 d update age).
    await db.rows(`UPDATE sessions SET expires_at = now() + interval '5 days'`);
    const before = await expiresAtMs(db);

    expect(await read(renderHeaders(cookie))).not.toBeNull();

    expect(await expiresAtMs(db)).toBe(before);
  });

  it("positive control: the get-session route handler does refresh the same row state", async () => {
    const { db, auth, cookie } = await signedIn();
    await db.rows(`UPDATE sessions SET expires_at = now() + interval '5 days'`);

    const response = await auth.handler(authRequest("/get-session", { cookie }));

    expect(response.status).toBe(200);
    expect(await expiresAtMs(db)).toBeGreaterThan(Date.now() + 6 * DAY_MS);
  });
});

describe("I-redact: a failing session read leaks no token", () => {
  it("logs no token or query parameters and rethrows without a cause", async () => {
    const consoleSpies = (["error", "warn", "log", "info", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { db, auth, sink, cookie, read } = await signedIn();
    const token = decodeURIComponent(cookie.slice(`${SESSION_COOKIE}=`.length)).split(".")[0] ?? "";
    expect(token.length).toBeGreaterThan(0);
    await db.rows(`ALTER TABLE sessions RENAME TO sessions_x`);

    const response = await auth.handler(authRequest("/get-session", { cookie }));
    let readError: unknown;
    try {
      await read(renderHeaders(cookie));
    } catch (error: unknown) {
      readError = error;
    }

    const body = response.ok ? await response.json() : null;
    expect(body).toBeNull();
    expect(readError).toBeInstanceOf(SessionReadError);
    expect(readError instanceof Error ? readError.cause : "not an error").toBeUndefined();
    const printed = serialised([
      ...sink.mock.calls,
      ...consoleSpies.flatMap((spy) => spy.mock.calls),
      [readError],
    ]);
    expect(printed).not.toContain(token);
    expect(printed).not.toContain("params:");
  });
});
