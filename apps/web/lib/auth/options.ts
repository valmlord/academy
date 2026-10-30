import { accounts, type Database, sessions, users, verifications } from "@academy/db";
import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { AuthLog } from "./logger";

/**
 * Hosts the dynamic base URL accepts (ADR-0008 item 6). The stack publishes its ports on 127.0.0.1
 * only; refusing every other Host also blocks DNS rebinding, because Better Auth then throws before
 * its router runs. Any loopback port works: pnpm dev (3000), compose (3080) and isolated runs.
 */
export const LOOPBACK_HOST_PATTERNS: readonly string[] = ["localhost:*", "127.0.0.1:*", "[::1]:*"];

export interface AuthOptionsInput {
  db: Database;
  /** Already validated by `readAuthSecret`. */
  secret: string;
  log: AuthLog;
}

/** The one Better Auth configuration of the app, shared by the server, the seed and the tests. */
export function createAuthOptions({ db, secret, log }: AuthOptionsInput): BetterAuthOptions {
  return {
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
      usePlural: true,
    }),
    secret,
    baseURL: { allowedHosts: [...LOOPBACK_HOST_PATTERNS], protocol: "http" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    // Defaults (7 d, extended after 1 d of use), written out; no cookie cache: every read is a DB read.
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    // Better Auth enables the limiter only in production by default; AC7 must hold in every mode.
    rateLimit: { enabled: true },
    advanced: {
      // Plain HTTP on loopback: a Secure or __Secure- cookie would not round-trip.
      useSecureCookies: false,
      // Explicit, because Better Auth skips the origin check under NODE_ENV=test by default.
      disableOriginCheck: false,
    },
    logger: { level: "warn", log },
    telemetry: { enabled: false },
    // Must stay the last plugin (Better Auth warns otherwise).
    plugins: [nextCookies()],
  };
}
