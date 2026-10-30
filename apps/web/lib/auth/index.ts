import "server-only";
import { createDb, type Database } from "@academy/db";
import { type Auth, betterAuth } from "better-auth";
import { describeDbError } from "../db-error";
import { readAuthSecret } from "./env";
import { createAuthLog } from "./logger";
import { createAuthOptions } from "./options";

// Wiring only (design 4.16): every test and the seed build their own instance from the marker-free
// modules, because this file's server-only import throws outside Next's server layers.

// Created on first use, never at import: next build evaluates route modules without DATABASE_URL or
// the secret. Kept on globalThis, because next dev re-evaluates an edited module and a module-scope
// memo would orphan the old pg.Pool on every edit.
const DB_SLOT = Symbol.for("academy.web.db");
const AUTH_SLOT = Symbol.for("academy.web.auth");

// globalThis declares no slot for these two symbols; the assertion adds exactly those two, optional.
const slots = globalThis as typeof globalThis & { [DB_SLOT]?: Database; [AUTH_SLOT]?: Auth };

/** The app's one Drizzle instance over one pg pool. */
export function getDb(): Database {
  slots[DB_SLOT] ??= createDb(process.env.DATABASE_URL ?? "", {
    onPoolError: (error) => {
      console.error(`web: idle database connection failed (${describeDbError(error)})`);
    },
  }).db;
  return slots[DB_SLOT];
}

/** The app's one Better Auth instance; throws `InvalidAuthSecretError` for a refused secret. */
export function getAuth(): Auth {
  if (slots[AUTH_SLOT] === undefined) {
    const secret = readAuthSecret({
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS,
    });
    const log = createAuthLog((line) => console.error(line));
    slots[AUTH_SLOT] = betterAuth(createAuthOptions({ db: getDb(), secret, log }));
  }
  return slots[AUTH_SLOT];
}
