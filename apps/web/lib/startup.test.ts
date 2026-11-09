// @vitest-environment node
import { inspect } from "node:util";
import { MigrationError, type MigrationStage } from "@academy/db";
import { describe, expect, it, vi } from "vitest";
import { connectHint, migrateOnStartup, type StartupDeps } from "./startup";

// The real exit never returns; the fake throws so the code after it does not run either.
class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}

const VALID_AUTH_ENV = {
  BETTER_AUTH_SECRET: "canary-auth-secret-u".padEnd(32, "x"),
  BETTER_AUTH_SECRETS: undefined,
};

// pnpm dev: the service and terminal variables unset, which is allowed.
const UNSET_WORKSPACE_ENV = {
  WORKSPACE_SERVICE_URL: undefined,
  WORKSPACE_SERVICE_SECRET: undefined,
  TERMINAL_RECONNECT_ATTEMPTS: undefined,
  TERMINAL_RELAY_MAX_SECONDS: undefined,
  ENVIRONMENT_START_SLOW_SECONDS: undefined,
};

function fakeDeps(
  databaseUrl: string | undefined,
  migrate: StartupDeps["migrate"],
  authEnv: StartupDeps["authEnv"] = VALID_AUTH_ENV,
  workspaceEnv: StartupDeps["workspaceEnv"] = UNSET_WORKSPACE_ENV,
) {
  const deps = {
    databaseUrl,
    authEnv,
    workspaceEnv,
    migrate: vi.fn(migrate),
    exit: vi.fn((code: number): never => {
      throw new ExitCalled(code);
    }),
    logError: vi.fn((_line: string) => {}),
    logInfo: vi.fn((_line: string) => {}),
  };
  return deps;
}

async function run(deps: StartupDeps): Promise<void> {
  try {
    await migrateOnStartup(deps);
  } catch (error: unknown) {
    if (!(error instanceof ExitCalled)) throw error;
  }
}

// What a logger prints: every argument of every call, rendered the way console.* renders it.
function printed(deps: ReturnType<typeof fakeDeps>): string {
  return [...deps.logError.mock.calls, ...deps.logInfo.mock.calls]
    .flat()
    .map((argument) => inspect(argument, { depth: Number.POSITIVE_INFINITY }))
    .join("\n");
}

function errorLine(deps: ReturnType<typeof fakeDeps>): string {
  expect(deps.logError).toHaveBeenCalledOnce();
  return String(deps.logError.mock.calls[0]?.[0]);
}

describe("migrateOnStartup", () => {
  it("exits with 1 and logs the stage and the connect hint without the connection string when the connection fails", async () => {
    const url = "postgres://academy:canary-pass-u1@db:5432/academy";
    const cause = Object.assign(new Error(`connect ECONNREFUSED ${url}`), {
      code: "ECONNREFUSED",
      connectionString: url,
    });
    const deps = fakeDeps(url, async () => {
      throw new MigrationError(
        "connect",
        "could not open the migration session (ECONNREFUSED)",
        cause,
      );
    });

    await run(deps);

    expect(deps.exit.mock.calls).toEqual([[1]]);
    const line = errorLine(deps);
    expect(line).toContain("MigrationError stage connect");
    expect(line).toContain(connectHint);
    expect(printed(deps)).not.toContain("canary-pass-u1");
  });

  const unlistedUrl = "postgres://academy:canary-pass-u1b@h/db";
  const errorNamedByUrl = new Error("boom");
  errorNamedByUrl.name = unlistedUrl;
  it.each([
    {
      kind: "an Error with the URL in its message",
      value: new Error(`connect to ${unlistedUrl} failed`),
      name: ": Error",
    },
    { kind: "a bare string", value: unlistedUrl, name: ": unknown" },
    { kind: "an Error whose name is the URL", value: errorNamedByUrl, name: ": unknown" },
  ])(
    "logs only the name of an unlisted error, never its message: $kind",
    async ({ value, name }) => {
      const deps = fakeDeps("postgres://academy:secret@db:5432/academy", async () => {
        throw value;
      });

      await run(deps);

      expect(deps.exit.mock.calls).toEqual([[1]]);
      expect(printed(deps)).not.toContain("canary-pass-u1b");
      expect(errorLine(deps)).toContain(name);
    },
  );

  const stageFailures: { stage: MigrationStage; message: string }[] = [
    {
      stage: "apply",
      message:
        "applying migrations from /x failed (unknown); no migration from this run was applied",
    },
    {
      stage: "lock",
      message:
        "could not acquire the migration lock within 60000 ms (55P03): another migrateDatabase may hold it",
    },
  ];
  it.each(stageFailures)(
    "adds the database hint only to connection failures: stage $stage",
    async ({ stage, message }) => {
      const deps = fakeDeps("postgres://academy:secret@db:5432/academy", async () => {
        throw new MigrationError(stage, message, new Error("cause"));
      });

      await run(deps);

      expect(deps.exit.mock.calls).toEqual([[1]]);
      const line = errorLine(deps);
      expect(line).toContain(`stage ${stage}`);
      expect(line).toContain(message);
      expect(line).not.toContain(connectHint);
      expect(line).not.toContain("docker compose");
    },
  );

  it.each([undefined, ""])(
    "exits with 1 without calling migrate when DATABASE_URL is missing: %j",
    async (databaseUrl) => {
      const deps = fakeDeps(databaseUrl, async () => {});

      await run(deps);

      expect(deps.exit.mock.calls).toEqual([[1]]);
      expect(deps.migrate).not.toHaveBeenCalled();
      expect(errorLine(deps)).toContain("DATABASE_URL is not set");
    },
  );

  it("applies migrations and does not exit when the database is reachable", async () => {
    const url = "postgres://academy:canary-pass-u3@db:5432/academy";
    const deps = fakeDeps(url, async () => {});

    await run(deps);

    expect(deps.migrate.mock.calls).toEqual([[url]]);
    expect(deps.exit).not.toHaveBeenCalled();
    expect(printed(deps)).not.toContain("canary-pass-u3");
    expect(deps.logInfo).toHaveBeenCalledWith("web: database migrations applied");
  });

  it.each([
    { kind: "missing", secret: undefined },
    { kind: "short", secret: "canary-short-secret-u" },
  ])("exits with 1 before migrating when BETTER_AUTH_SECRET is $kind", async ({ secret }) => {
    const deps = fakeDeps("postgres://academy:secret@db:5432/academy", async () => {}, {
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_SECRETS: undefined,
    });

    await run(deps);

    expect(deps.migrate).not.toHaveBeenCalled();
    expect(deps.exit.mock.calls).toEqual([[1]]);
    expect(errorLine(deps)).toContain("InvalidAuthSecretError");
    expect(printed(deps)).not.toContain("canary-");
  });
});

// U-startup (#32 design 10.3): the workspace service settings are refused by name and rule before migrating,
// and never by contacting the service.
describe("migrateOnStartup with the workspace service settings", () => {
  // The compose values; the URL names a host that resolves nowhere here, so a contact would fail.
  const COMPOSE_WORKSPACE_ENV = {
    WORKSPACE_SERVICE_URL: "http://workspace.invalid:4100",
    WORKSPACE_SERVICE_SECRET: "canary-service-secret-u".padEnd(32, "x"),
    TERMINAL_RECONNECT_ATTEMPTS: "5",
    TERMINAL_RELAY_MAX_SECONDS: "900",
    ENVIRONMENT_START_SLOW_SECONDS: "10",
  };
  const URL_U = "postgres://academy:secret@db:5432/academy";

  it("starts with valid settings while the service is unreachable", async () => {
    const deps = fakeDeps(URL_U, async () => {}, VALID_AUTH_ENV, COMPOSE_WORKSPACE_ENV);

    await run(deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.migrate).toHaveBeenCalledOnce();
  });

  it("starts with every service and terminal variable unset", async () => {
    const deps = fakeDeps(URL_U, async () => {});

    await run(deps);

    expect(deps.exit).not.toHaveBeenCalled();
    expect(deps.migrate).toHaveBeenCalledOnce();
  });

  it.each([
    {
      case: "a short secret",
      change: { WORKSPACE_SERVICE_SECRET: "canary-short-u" },
      line: "web: InvalidWorkspaceServiceConfigError: WORKSPACE_SERVICE_SECRET must be at least 32 characters when WORKSPACE_SERVICE_URL is set",
    },
    {
      case: "no secret",
      change: { WORKSPACE_SERVICE_SECRET: undefined },
      line: "web: InvalidWorkspaceServiceConfigError: WORKSPACE_SERVICE_SECRET must be at least 32 characters when WORKSPACE_SERVICE_URL is set",
    },
    {
      case: "an https URL",
      change: { WORKSPACE_SERVICE_URL: "https://canary-host-u:4100" },
      line: "web: InvalidWorkspaceServiceConfigError: WORKSPACE_SERVICE_URL must be an http: URL",
    },
    {
      case: "a URL that does not parse",
      change: { WORKSPACE_SERVICE_URL: "canary-url-u" },
      line: "web: InvalidWorkspaceServiceConfigError: WORKSPACE_SERVICE_URL must be an http: URL",
    },
    ...["0", "21", "x"].map((value) => ({
      case: `TERMINAL_RECONNECT_ATTEMPTS=${value}`,
      change: { TERMINAL_RECONNECT_ATTEMPTS: value },
      line: "web: InvalidWorkspaceServiceConfigError: TERMINAL_RECONNECT_ATTEMPTS must be an integer from 1 to 20",
    })),
    ...["119", "3601", "x"].map((value) => ({
      case: `TERMINAL_RELAY_MAX_SECONDS=${value}`,
      change: { TERMINAL_RELAY_MAX_SECONDS: value },
      line: "web: InvalidWorkspaceServiceConfigError: TERMINAL_RELAY_MAX_SECONDS must be an integer from 120 to 3600",
    })),
    ...["0", "121", "x"].map((value) => ({
      case: `ENVIRONMENT_START_SLOW_SECONDS=${value}`,
      change: { ENVIRONMENT_START_SLOW_SECONDS: value },
      line: "web: InvalidWorkspaceServiceConfigError: ENVIRONMENT_START_SLOW_SECONDS must be an integer from 1 to 120",
    })),
  ])("exits with 1 before migrating for $case, naming the variable", async ({ change, line }) => {
    const deps = fakeDeps(URL_U, async () => {}, VALID_AUTH_ENV, {
      ...COMPOSE_WORKSPACE_ENV,
      ...change,
    });

    await run(deps);

    expect(deps.migrate).not.toHaveBeenCalled();
    expect(deps.exit.mock.calls).toEqual([[1]]);
    expect(errorLine(deps)).toBe(line);
    expect(printed(deps)).not.toContain("canary-");
  });

  it.each([
    ["TERMINAL_RECONNECT_ATTEMPTS", "1"],
    ["TERMINAL_RECONNECT_ATTEMPTS", "20"],
    ["TERMINAL_RELAY_MAX_SECONDS", "120"],
    ["TERMINAL_RELAY_MAX_SECONDS", "3600"],
    ["ENVIRONMENT_START_SLOW_SECONDS", "1"],
    ["ENVIRONMENT_START_SLOW_SECONDS", "120"],
  ])("accepts %s=%s at the edge of its range", async (name, value) => {
    const deps = fakeDeps(URL_U, async () => {}, VALID_AUTH_ENV, {
      ...COMPOSE_WORKSPACE_ENV,
      [name]: value,
    });

    await run(deps);

    expect(deps.exit).not.toHaveBeenCalled();
  });
});
