import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { CONFIG_DEFAULTS, CONFIG_VARIABLES, type ConfigVariable } from "../../src/config.js";

// U-compose (design 12.1): the compose files are the deployment's security boundary (no host port for the
// service, an internal network, db unpublished by default), so their shape is asserted, not trusted.

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const serviceSchema = z.looseObject({
  ports: z.array(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  env_file: z.unknown().optional(),
  depends_on: z.unknown().optional(),
  read_only: z.boolean().optional(),
  cap_drop: z.array(z.string()).optional(),
  security_opt: z.array(z.string()).optional(),
  init: z.boolean().optional(),
});

const composeSchema = z.looseObject({
  services: z.record(z.string(), serviceSchema),
  networks: z.record(z.string(), z.looseObject({ internal: z.boolean().optional() })).optional(),
});

function readYaml(file: string): unknown {
  return parse(readFileSync(`${REPO_ROOT}${file}`, "utf8"));
}

const compose = composeSchema.parse(readYaml("docker-compose.yml"));

function service(name: string): z.infer<typeof serviceSchema> {
  const found = compose.services[name];
  if (found === undefined) throw new Error(`docker-compose.yml has no service ${name}`);
  return found;
}

/** The 8.1 "Compose passes" column: fixed values and `${VAR:-default}` forms, never `env_file`. */
const EXPECTED_ENVIRONMENT: Readonly<Record<ConfigVariable | "DOCKER_HOST", string>> = {
  WORKSPACE_SERVICE_SECRET:
    "${WORKSPACE_SERVICE_SECRET:?set WORKSPACE_SERVICE_SECRET in .env, see .env.example}",
  WORKSPACE_INSTANCE: "${WORKSPACE_INSTANCE:-local}",
  WORKSPACE_HOST: "0.0.0.0",
  WORKSPACE_PORT: "4100",
  COURSE_ROOT: "/course",
  WORKSPACE_IMAGE: "${WORKSPACE_IMAGE:-}",
  WORKSPACE_CPU_LIMIT: "${WORKSPACE_CPU_LIMIT:-2}",
  WORKSPACE_MEMORY_LIMIT: "${WORKSPACE_MEMORY_LIMIT:-2g}",
  WORKSPACE_PIDS_LIMIT: "${WORKSPACE_PIDS_LIMIT:-512}",
  ENVIRONMENT_IDLE_STOP_MINUTES: "${ENVIRONMENT_IDLE_STOP_MINUTES:-30}",
  ENVIRONMENT_IDLE_WARNING_MINUTES: "${ENVIRONMENT_IDLE_WARNING_MINUTES:-5}",
  ENVIRONMENT_START_SLOW_SECONDS: "${ENVIRONMENT_START_SLOW_SECONDS:-10}",
  TERMINAL_SHELL: "${TERMINAL_SHELL:-/bin/sh}",
  DOCKER_HOST: "unix:///var/run/docker.sock",
};

const DEFAULT_FORM = /^\$\{([A-Z_]+):-(.*)\}$/;

describe("docker-compose.yml (U-compose)", () => {
  it("publishes no port of the workspace service and keeps it off the default network", () => {
    const workspace = service("workspace");

    expect(workspace.ports).toBeUndefined();
    expect(workspace.networks).toEqual(["workspace-api"]);
  });

  it("mounts exactly the Docker socket and the course, read-only", () => {
    expect(service("workspace").volumes).toEqual([
      "/var/run/docker.sock:/var/run/docker.sock",
      "./course:/course:ro",
    ]);
  });

  it("hardens the workspace service: read-only rootfs, no capabilities, init, no-new-privileges", () => {
    const workspace = service("workspace");

    expect(workspace.read_only).toBe(true);
    expect(workspace.cap_drop).toEqual(["ALL"]);
    expect(workspace.security_opt).toEqual(["no-new-privileges:true"]);
    expect(workspace.init).toBe(true);
    expect(workspace.env_file).toBeUndefined();
    expect(workspace.depends_on).toBeUndefined();
  });

  it("makes workspace-api an internal network that web joins and db does not", () => {
    expect(compose.networks?.["workspace-api"]?.internal).toBe(true);
    expect(service("web").networks).toEqual(["default", "workspace-api"]);
    expect(service("db").networks ?? []).not.toContain("workspace-api");
  });

  it("publishes no db port by default", () => {
    expect(service("db").ports).toBeUndefined();
  });

  it("passes exactly the config variables plus DOCKER_HOST, in the 8.1 forms", () => {
    const environment = service("workspace").environment;

    expect(Object.keys(environment ?? {}).sort()).toEqual(
      [...CONFIG_VARIABLES, "DOCKER_HOST"].sort(),
    );
    expect(environment).toEqual(EXPECTED_ENVIRONMENT);
  });

  it("gives every ${VAR:-default} the default config.ts applies", () => {
    const environment = service("workspace").environment ?? {};
    let compared = 0;
    for (const name of CONFIG_VARIABLES) {
      const match = DEFAULT_FORM.exec(environment[name] ?? "");
      // The instance is required by config.ts (no default there); compose names the owner's instance.
      if (match === null || name === "WORKSPACE_INSTANCE") continue;
      expect(match[1], name).toBe(name);
      expect(match[2], name).toBe(CONFIG_DEFAULTS[name]);
      compared += 1;
    }

    expect(compared).toBe(8);
  });

  it("refuses to start without the secret (the :? form)", () => {
    expect(service("workspace").environment?.WORKSPACE_SERVICE_SECRET).toMatch(
      /^\$\{WORKSPACE_SERVICE_SECRET:\?[^}]+\}$/,
    );
  });
});

describe("compose.db-port.yaml (U-compose)", () => {
  it("adds only the loopback db port", () => {
    expect(readYaml("compose.db-port.yaml")).toEqual({
      services: { db: { ports: ["127.0.0.1:${DB_PORT:-5432}:5432"] } },
    });
  });
});
