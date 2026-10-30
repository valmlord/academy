import { randomBytes } from "node:crypto";
import { type Auth, betterAuth } from "better-auth";
import { vi } from "vitest";
import { createAuthLog } from "@/lib/auth/logger";
import { createAuthOptions } from "@/lib/auth/options";
import type { TestDatabase } from "./db";

// Built from the marker-free modules, like the app's getAuth(); never lib/auth/index.ts (server-only).

export const SESSION_COOKIE = "better-auth.session_token";
export const APP_HOST = "127.0.0.1:3080";
export const APP_ORIGIN = `http://${APP_HOST}`;

export interface TestAuth {
  auth: Auth;
  /** Every line the redacting logger wrote. */
  sink: ReturnType<typeof vi.fn<(line: string) => void>>;
}

export function testAuth(database: TestDatabase): TestAuth {
  const sink = vi.fn<(line: string) => void>();
  const auth = betterAuth(
    createAuthOptions({
      db: database.db,
      secret: randomBytes(32).toString("hex"),
      log: createAuthLog(sink),
    }),
  );
  return { auth, sink };
}

/** A user with a credential account, written the way the seed writes it (Better Auth's adapter). */
export async function createCredentialUser(
  auth: Auth,
  email: string,
  password: string,
): Promise<string> {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email, name: "Learner", emailVerified: false },
    { method: "email-password" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  return user.id;
}

let forwardedFor = 0;

export interface AuthRequestInit {
  method?: "GET" | "POST";
  body?: unknown;
  cookie?: string;
  host?: string;
  origin?: string;
  /** Defaults to a fresh address per request, so no two requests share a rate-limit bucket. */
  xff?: string;
}

/** A request to Better Auth's handler as the browser on the compose stack sends it. */
export function authRequest(path: string, init: AuthRequestInit = {}): Request {
  forwardedFor += 1;
  const host = init.host ?? APP_HOST;
  const headers = new Headers({
    host,
    origin: init.origin ?? APP_ORIGIN,
    "x-forwarded-for":
      init.xff ?? `10.29.${Math.floor(forwardedFor / 250) + 100}.${forwardedFor % 250}`,
  });
  if (init.cookie !== undefined) headers.set("cookie", init.cookie);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://${host}/api/auth${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** `name=value` of the session cookie a response sets; throws when it sets none. */
export function sessionCookieOf(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  if (cookie === undefined) throw new Error(`the response sets no ${SESSION_COOKIE} cookie`);
  return cookie.split(";", 1)[0] ?? "";
}

export async function signIn(
  auth: Auth,
  email: string,
  password: string,
  init: AuthRequestInit = {},
): Promise<Response> {
  return auth.handler(authRequest("/sign-in/email", { ...init, body: { email, password } }));
}
