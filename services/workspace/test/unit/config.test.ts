import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { CONFIG_DEFAULTS, CONFIG_VARIABLES, loadConfig } from "../../src/config.js";
import { InvalidConfigError } from "../../src/errors.js";

const SECRET = "s".repeat(32);
const REQUIRED = {
  WORKSPACE_SERVICE_SECRET: SECRET,
  WORKSPACE_INSTANCE: "local",
  COURSE_ROOT: "/course",
};

function configError(env: Record<string, string>): InvalidConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof InvalidConfigError) return error;
    throw error;
  }
  throw new Error("loadConfig accepted the environment");
}

describe("loadConfig", () => {
  it("applies every default when only the required variables are set", () => {
    const config = loadConfig(REQUIRED);

    expect(config).toEqual({
      secret: SECRET,
      instance: "local",
      host: "127.0.0.1",
      port: 4100,
      courseRoot: "/course",
      imageOverride: null,
      limits: { nanoCpus: 2_000_000_000, memoryBytes: 2 * 1024 ** 3, pidsLimit: 512 },
      idleStopMinutes: 30,
      idleWarningMinutes: 5,
      startSlowSeconds: 10,
      terminalShell: "/bin/sh",
      terminalScrollbackLines: 1000,
    });
  });

  it("reads megabyte memory, fractional cpus and an image override", () => {
    const config = loadConfig({
      ...REQUIRED,
      WORKSPACE_MEMORY_LIMIT: "512m",
      WORKSPACE_CPU_LIMIT: "0.5",
      WORKSPACE_IMAGE: "node:22.23.4-alpine",
    });

    expect(config.limits).toEqual({
      nanoCpus: 500_000_000,
      memoryBytes: 512 * 1024 ** 2,
      pidsLimit: 512,
    });
    expect(config.imageOverride).toBe("node:22.23.4-alpine");
  });

  it("names the variable when the secret is missing", () => {
    const { WORKSPACE_SERVICE_SECRET: _omitted, ...env } = REQUIRED;

    const error = configError(env);

    expect(error.variable).toBe("WORKSPACE_SERVICE_SECRET");
    expect(error.message).toContain("WORKSPACE_SERVICE_SECRET");
  });

  it("refuses a 31-character secret and never prints its value", () => {
    const canary = `canary-${"x".repeat(24)}`;
    expect(canary).toHaveLength(31);

    const error = configError({ ...REQUIRED, WORKSPACE_SERVICE_SECRET: canary });

    expect(error.variable).toBe("WORKSPACE_SERVICE_SECRET");
    expect(inspect(error, { depth: Number.POSITIVE_INFINITY })).not.toContain("canary");
  });

  it("never prints the value of any refused variable", () => {
    const error = configError({ ...REQUIRED, WORKSPACE_MEMORY_LIMIT: "canary-2x" });

    expect(error.variable).toBe("WORKSPACE_MEMORY_LIMIT");
    expect(inspect(error, { depth: Number.POSITIVE_INFINITY })).not.toContain("canary");
  });

  it("refuses a relative COURSE_ROOT", () => {
    expect(configError({ ...REQUIRED, COURSE_ROOT: "course" }).variable).toBe("COURSE_ROOT");
  });

  it("refuses a memory limit with an unknown unit", () => {
    expect(configError({ ...REQUIRED, WORKSPACE_MEMORY_LIMIT: "2x" }).variable).toBe(
      "WORKSPACE_MEMORY_LIMIT",
    );
  });

  it("refuses an idle warning that is not before the idle stop", () => {
    const env = {
      ...REQUIRED,
      ENVIRONMENT_IDLE_STOP_MINUTES: "10",
      ENVIRONMENT_IDLE_WARNING_MINUTES: "10",
    };

    expect(configError(env).variable).toBe("ENVIRONMENT_IDLE_WARNING_MINUTES");
    expect(loadConfig({ ...env, ENVIRONMENT_IDLE_WARNING_MINUTES: "9" }).idleWarningMinutes).toBe(
      9,
    );
  });

  it.each(["my_local", "Local"])("refuses the instance %s", (instance) => {
    expect(configError({ ...REQUIRED, WORKSPACE_INSTANCE: instance }).variable).toBe(
      "WORKSPACE_INSTANCE",
    );
  });

  it("reads an absolute TERMINAL_SHELL", () => {
    expect(loadConfig({ ...REQUIRED, TERMINAL_SHELL: "/bin/bash" }).terminalShell).toBe(
      "/bin/bash",
    );
  });

  it.each(["bash", "/bin/sh -c id", "/bin/sh\n", "/bin/$(id)"])(
    "refuses the TERMINAL_SHELL %j",
    (shell) => {
      expect(configError({ ...REQUIRED, TERMINAL_SHELL: shell }).variable).toBe("TERMINAL_SHELL");
    },
  );

  it("reads TERMINAL_SCROLLBACK_LINES, 1000 by default", () => {
    expect(loadConfig(REQUIRED).terminalScrollbackLines).toBe(1000);
    expect(
      loadConfig({ ...REQUIRED, TERMINAL_SCROLLBACK_LINES: "100" }).terminalScrollbackLines,
    ).toBe(100);
    expect(
      loadConfig({ ...REQUIRED, TERMINAL_SCROLLBACK_LINES: "10000" }).terminalScrollbackLines,
    ).toBe(10_000);
  });

  it.each(["99", "10001", "1e3", "-5"])("refuses the TERMINAL_SCROLLBACK_LINES %j", (lines) => {
    expect(configError({ ...REQUIRED, TERMINAL_SCROLLBACK_LINES: lines }).variable).toBe(
      "TERMINAL_SCROLLBACK_LINES",
    );
  });

  it("lists a default only for variables it reads", () => {
    for (const variable of Object.keys(CONFIG_DEFAULTS)) {
      expect(CONFIG_VARIABLES).toContain(variable);
    }
  });
});
