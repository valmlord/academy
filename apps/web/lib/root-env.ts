// The one place that may load the repository's root .env (next.config.ts, playwright.config.ts and
// scripts/seed.ts call it). Isolated runs export ACADEMY_SKIP_ROOT_ENV=1 so that a build, dev server, seed
// or e2e run started from a checkout that holds the owner's .env never reads it.
// Erasable syntax only (no enum, namespace or parameter property): Node's strip-only TypeScript loader
// loads this file for next.config.ts, and anything else makes Next fall back to its legacy loader.

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const ROOT_ENV_OPT_OUT = "ACADEMY_SKIP_ROOT_ENV";

// A value longer than this is printed as its length only: a secret pasted into the wrong variable must
// not land in a build log, while a short typo such as "true" is shown so it can be fixed.
const MAX_ECHOED_VALUE_LENGTH = 8;

export class InvalidRootEnvOptOutError extends Error {
  constructor(value: string) {
    const shown = value.length <= MAX_ECHOED_VALUE_LENGTH ? value : `<${value.length} characters>`;
    super(`${ROOT_ENV_OPT_OUT} must be 1 or unset, got ${shown}`);
    this.name = "InvalidRootEnvOptOutError";
  }
}

export interface LoadRootEnvOptions {
  env: Record<string, string | undefined>;
  file: string;
  log: (line: string) => void;
  load?: (file: string) => void;
}

export type RootEnvOutcome = "loaded" | "skipped" | "absent";

export function loadRootEnv({
  env,
  file,
  log,
  load = (path) => process.loadEnvFile(path),
}: LoadRootEnvOptions): RootEnvOutcome {
  const optOut = env[ROOT_ENV_OPT_OUT];
  if (optOut === "1") {
    // The file is not even probed, so a skipped run leaves no trace of it.
    log(`root .env not loaded: ${ROOT_ENV_OPT_OUT}=1`);
    return "skipped";
  }
  // Any other value fails closed: a typo must not silently load the file.
  if (optOut !== undefined && optOut !== "") {
    throw new InvalidRootEnvOptOutError(optOut);
  }
  if (!existsSync(file)) {
    return "absent";
  }
  load(file);
  return "loaded";
}

export interface ReadRootEnvKeysOptions {
  env: Record<string, string | undefined>;
  file: string;
  read?: (file: string) => string;
}

/**
 * The names the root .env defines, never their values (#106 design 2.8): a switch the file sets does not count as
 * one set in the shell. Parsed with Node's own .env parser, so a line counts exactly when the loader counts it.
 */
export function readRootEnvKeys({
  env,
  file,
  read = (path) => readFileSync(path, "utf8"),
}: ReadRootEnvKeysOptions): string[] {
  if (env[ROOT_ENV_OPT_OUT] === "1") return [];
  if (!existsSync(file)) return [];
  return Object.keys(parseEnv(read(file)));
}
