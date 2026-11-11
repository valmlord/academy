// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DestructiveE2eSkippedInCiError,
  destructiveE2eDecision,
  requireDestructiveE2eInCi,
} from "./disposable-stack";

// DG1-DG23 and EX1 (#106 design 7.1): which command forms may run e2e/environment-actions.spec.ts. The root keys
// of every row are a literal list; only EX1 reads the committed .env.example.

type Env = Record<string, string | undefined>;

// The five live keys of .env.example, and CI's root .env: that file plus the two secrets ci.yml appends. When
// .env.example gains a live key, update this list by hand; EX1 still guards the keys that matter.
const EXAMPLE_KEYS = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "DATABASE_URL",
  "WEB_PORT",
];
const CI_ROOT_KEYS = [...EXAMPLE_KEYS, "BETTER_AUTH_SECRET", "WORKSPACE_SERVICE_SECRET"];

// What the config does: the shell's E2E_BASE_URL, else the compose default.
const DEFAULT_BASE_URL = "http://127.0.0.1:3080";

const SECRET_SENTINEL = "sentinel-secret-106";
const PATH_SENTINEL = "/sentinel-path-106";

interface Row {
  id: string;
  env: Env;
  rootKeys: readonly string[];
}

function decide({ env, rootKeys }: Row): ReturnType<typeof destructiveE2eDecision> {
  return destructiveE2eDecision({
    env,
    rootEnvKeys: rootKeys,
    baseURL: env.E2E_BASE_URL ?? DEFAULT_BASE_URL,
  });
}

const SWITCH = { E2E_DISPOSABLE_STACK: "1" };

const SKIP_ROWS: Row[] = [
  {
    id: "DG1 the .env.example base URL line uncommented",
    env: { E2E_BASE_URL: "http://127.0.0.1:3080", E2E_TERMINAL: "1" },
    rootKeys: ["E2E_BASE_URL"],
  },
  {
    id: "DG2 the README form from the shell",
    env: { E2E_BASE_URL: "http://127.0.0.1:3080", E2E_TERMINAL: "1" },
    rootKeys: [],
  },
  {
    id: "DG3 localhost on 3080 with the switch, no CI",
    env: { ...SWITCH, E2E_BASE_URL: "http://localhost:3080/" },
    rootKeys: [],
  },
  {
    id: "DG4 the switch in the root .env",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:53081" },
    rootKeys: ["E2E_DISPOSABLE_STACK"],
  },
  {
    id: "DG5 CI's step env in the owner's shell, no CI",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:3080", E2E_TERMINAL: "1" },
    rootKeys: [],
  },
  { id: "DG6 the switch with the default origin", env: { ...SWITCH }, rootKeys: [] },
  {
    id: "DG7 CI from the root .env",
    env: { ...SWITCH, CI: "true", E2E_BASE_URL: "http://127.0.0.1:3080" },
    rootKeys: ["CI"],
  },
  {
    id: "DG8 [::1]",
    env: { ...SWITCH, E2E_BASE_URL: "http://[::1]:3080" },
    rootKeys: [],
  },
  {
    id: "DG8 0.0.0.0",
    env: { ...SWITCH, E2E_BASE_URL: "http://0.0.0.0:3080" },
    rootKeys: [],
  },
  { id: "DG9 an unparsable base URL", env: { ...SWITCH, E2E_BASE_URL: "not a url" }, rootKeys: [] },
  {
    id: "DG10 the base URL only in the root .env",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:53081" },
    rootKeys: ["E2E_BASE_URL"],
  },
  {
    id: "DG15 localhost on a free port",
    env: { ...SWITCH, E2E_BASE_URL: "http://localhost:53081" },
    rootKeys: [],
  },
  {
    id: "DG16 localhost.",
    env: { ...SWITCH, E2E_BASE_URL: "http://localhost.:53081" },
    rootKeys: [],
  },
  {
    id: "DG16 [::ffff:127.0.0.1]",
    env: { ...SWITCH, E2E_BASE_URL: "http://[::ffff:127.0.0.1]:53081" },
    rootKeys: [],
  },
  {
    id: "DG17 no explicit port",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1" },
    rootKeys: [],
  },
  {
    id: "DG17 https",
    env: { ...SWITCH, E2E_BASE_URL: "https://127.0.0.1:53081" },
    rootKeys: [],
  },
  {
    id: "DG18 the owner's stack on its root .env port",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:4000", WEB_PORT: "4000" },
    rootKeys: ["WEB_PORT"],
  },
  {
    id: "DG18b the owner's port with a leading zero",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:4000", WEB_PORT: "04000" },
    rootKeys: ["WEB_PORT"],
  },
  {
    id: "DG18c a root WEB_PORT that is no decimal port",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:53081", WEB_PORT: "web" },
    rootKeys: ["WEB_PORT"],
  },
];

const RUN_ROWS: Row[] = [
  {
    id: "DG11 isolated-stack.sh --e2e",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:53081", E2E_TERMINAL: "1" },
    rootKeys: [],
  },
  {
    id: "DG12 CI's e2e step",
    env: {
      CI: "true",
      ...SWITCH,
      E2E_BASE_URL: "http://127.0.0.1:3080",
      E2E_TERMINAL: "1",
      WEB_PORT: "3080",
    },
    rootKeys: CI_ROOT_KEYS,
  },
  {
    id: "DG19 a stack port in WEB_PORT that the root .env does not define",
    env: { ...SWITCH, E2E_BASE_URL: "http://127.0.0.1:53081", WEB_PORT: "53081" },
    rootKeys: [],
  },
];

/** DG14: the row with a secret the root .env load puts into the environment, and a path on its base URL. */
function withSentinels(row: Row): Row {
  const { E2E_BASE_URL: baseUrl } = row.env;
  return {
    ...row,
    env: {
      ...row.env,
      BETTER_AUTH_SECRET: SECRET_SENTINEL,
      ...(baseUrl === undefined
        ? {}
        : { E2E_BASE_URL: `${baseUrl.replace(/\/$/, "")}${PATH_SENTINEL}` }),
    },
  };
}

describe("destructiveE2eDecision", () => {
  it.each(SKIP_ROWS.map((row) => [row.id, row] as const))("skips: %s", (_id, row) => {
    expect(decide(row).isAllowed).toBe(false);
  });

  it.each(RUN_ROWS.map((row) => [row.id, row] as const))("runs: %s", (_id, row) => {
    expect(decide(row).isAllowed).toBe(true);
  });

  it.each(SKIP_ROWS.map((row) => [row.id, row] as const))(
    "still skips with sentinels and echoes neither: %s (DG14)",
    (_id, row) => {
      const decision = decide(withSentinels(row));

      expect(decision.isAllowed).toBe(false);
      expect(decision.reason).not.toContain(SECRET_SENTINEL);
      expect(decision.reason).not.toContain(PATH_SENTINEL);
    },
  );
});

describe("isSwitchOn E2E_DISPOSABLE_STACK (DG13)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses a value other than 1", async () => {
    // A clean import: the config reads no root .env and none of the switches it checks at load.
    for (const name of [
      "E2E_TERMINAL",
      "E2E_WEBKIT",
      "E2E_FIREFOX",
      "E2E_SERVICE_DOWN",
      "E2E_ALL_BROWSERS",
    ]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv("ACADEMY_SKIP_ROOT_ENV", "1");
    vi.stubEnv("E2E_DISPOSABLE_STACK", undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { InvalidE2eSwitchError, isSwitchOn } = await import("../playwright.config.ts");

    vi.stubEnv("E2E_DISPOSABLE_STACK", "true");

    expect(() => isSwitchOn("E2E_DISPOSABLE_STACK")).toThrow(InvalidE2eSwitchError);
  });
});

const CI_THROW_ENV: Env = {
  CI: "true",
  E2E_TERMINAL: "1",
  E2E_BASE_URL: `http://127.0.0.1:3080${PATH_SENTINEL}`,
  BETTER_AUTH_SECRET: SECRET_SENTINEL,
};

function requireFor(env: Env, rootKeys: readonly string[]): () => void {
  const decision = decide({ id: "", env, rootKeys });
  return () => requireDestructiveE2eInCi({ env, rootEnvKeys: rootKeys, decision });
}

/** The error the call throws; fails the test when it throws nothing or something else. */
function thrownBy(call: () => void): DestructiveE2eSkippedInCiError {
  try {
    call();
  } catch (error: unknown) {
    if (error instanceof DestructiveE2eSkippedInCiError) return error;
    throw error;
  }
  throw new Error("expected DestructiveE2eSkippedInCiError, nothing was thrown");
}

describe("requireDestructiveE2eInCi", () => {
  it.each([
    ["DG20 the switch lost", CI_THROW_ENV, CI_ROOT_KEYS],
    [
      "DG20b a live switch line in .env.example",
      { ...CI_THROW_ENV, ...SWITCH },
      [...CI_ROOT_KEYS, "E2E_DISPOSABLE_STACK"],
    ],
    [
      "DG20c a live base URL line in .env.example",
      { ...CI_THROW_ENV, ...SWITCH },
      [...CI_ROOT_KEYS, "E2E_BASE_URL"],
    ],
  ] as const)("throws in CI's terminal suite: %s", (_id, env, rootKeys) => {
    const { reason } = decide({ id: "", env, rootKeys });

    const error = thrownBy(requireFor(env, rootKeys));

    expect(error.message).toContain(reason);
    expect(error.message).not.toContain(SECRET_SENTINEL);
    expect(error.message).not.toContain(PATH_SENTINEL);
  });

  it.each([
    ["DG21 CI's e2e step as configured", RUN_ROWS[1]?.env ?? {}, CI_ROOT_KEYS],
    [
      "DG22 CI only from the root .env",
      { ...SWITCH, CI: "true", E2E_BASE_URL: "http://127.0.0.1:3080", E2E_TERMINAL: "1" },
      ["CI"],
    ],
    [
      "DG23 CI's service-down step",
      { CI: "true", E2E_SERVICE_DOWN: "1", E2E_BASE_URL: "http://127.0.0.1:3080" },
      CI_ROOT_KEYS,
    ],
  ] as const)("does not throw: %s", (_id, env, rootKeys) => {
    expect(requireFor(env, rootKeys)).not.toThrow();
  });
});

describe("the committed .env.example (EX1)", () => {
  it("defines no key that changes where the destructive spec runs", () => {
    const file = path.resolve(import.meta.dirname, "../../../.env.example");

    const keys = Object.keys(parseEnv(readFileSync(file, "utf8")));

    expect(
      keys.filter((key) =>
        ["CI", "E2E_DISPOSABLE_STACK", "E2E_BASE_URL", "E2E_TERMINAL"].includes(key),
      ),
    ).toEqual([]);
  });
});
