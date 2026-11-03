import { isAbsolute } from "node:path";
import { z } from "zod";
import { InvalidConfigError } from "./errors.js";

// The environment is untrusted input: every variable is checked against a closed rule, and a failure names
// the variable and the rule only. The value never enters a message, because the secret is one of them and a
// startup error is printed to the container log.

/** Every variable `loadConfig` reads; U-compose compares the compose `environment` block with this list. */
export const CONFIG_VARIABLES = [
  "WORKSPACE_SERVICE_SECRET",
  "WORKSPACE_INSTANCE",
  "WORKSPACE_HOST",
  "WORKSPACE_PORT",
  "COURSE_ROOT",
  "WORKSPACE_IMAGE",
  "WORKSPACE_CPU_LIMIT",
  "WORKSPACE_MEMORY_LIMIT",
  "WORKSPACE_PIDS_LIMIT",
  "ENVIRONMENT_IDLE_STOP_MINUTES",
  "ENVIRONMENT_IDLE_WARNING_MINUTES",
  "ENVIRONMENT_START_SLOW_SECONDS",
] as const;

export type ConfigVariable = (typeof CONFIG_VARIABLES)[number];

/**
 * Defaults as the environment would spell them, so compose's `${VAR:-default}` can be compared with them.
 * The secret, the instance and `COURSE_ROOT` are required and have none. An empty `WORKSPACE_IMAGE` means
 * "no override" (design 8.1).
 */
export const CONFIG_DEFAULTS: Readonly<Partial<Record<ConfigVariable, string>>> = {
  WORKSPACE_HOST: "127.0.0.1",
  WORKSPACE_PORT: "4100",
  WORKSPACE_IMAGE: "",
  WORKSPACE_CPU_LIMIT: "2",
  WORKSPACE_MEMORY_LIMIT: "2g",
  WORKSPACE_PIDS_LIMIT: "512",
  ENVIRONMENT_IDLE_STOP_MINUTES: "30",
  ENVIRONMENT_IDLE_WARNING_MINUTES: "5",
  ENVIRONMENT_START_SLOW_SECONDS: "10",
};

/** The three limits a workspace container gets, in the units the Docker Engine API takes. */
export interface WorkspaceLimits {
  nanoCpus: number;
  memoryBytes: number;
  pidsLimit: number;
}

export interface Config {
  secret: string;
  instance: string;
  host: string;
  port: number;
  courseRoot: string;
  /** Replaces every lesson's image when set; `null` when the variable is unset or empty. */
  imageOverride: string | null;
  limits: WorkspaceLimits;
  idleStopMinutes: number;
  idleWarningMinutes: number;
  startSlowSeconds: number;
}

type Env = Readonly<Record<string, string | undefined>>;

/** Q4: a shorter shared secret is guessable enough to matter on a shared machine. */
const SECRET_MIN_LENGTH = 32;
/** Docker names are built from it (`wks-<instance>-...`), so it stays short, lower-case and separator-safe. */
const INSTANCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,15}$/;
const MAX_TCP_PORT = 65_535;
const NANOS_PER_CPU = 1_000_000_000;
const MIB = 1024 ** 2;
const GIB = 1024 * MIB;

// Ranges of design 4.5 and 4.10: wide enough for any real machine, narrow enough to refuse a typo
// (a memory limit of 2 bytes, an idle stop after a minute).
const CPU_RANGE = { min: 0.1, max: 16 };
const MEMORY_RANGE = { min: 64 * MIB, max: 16 * GIB };
const PIDS_RANGE = { min: 32, max: 32_768 };
const IDLE_STOP_MINUTES_RANGE = { min: 5, max: 1440 };
const START_SLOW_SECONDS_RANGE = { min: 1, max: 120 };

function integerText(min: number, max: number): z.ZodType<number> {
  return z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));
}

const cpuCount = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .transform(Number)
  .pipe(z.number().min(CPU_RANGE.min).max(CPU_RANGE.max));

const memoryBytes = z
  .string()
  .regex(/^\d+[mg]$/)
  .transform((text) => Number(text.slice(0, -1)) * (text.endsWith("g") ? GIB : MIB))
  .pipe(z.number().min(MEMORY_RANGE.min).max(MEMORY_RANGE.max));

/** An unset or empty variable takes its default, as compose's `${VAR:-default}` does. */
function rawValue(env: Env, variable: ConfigVariable): string | undefined {
  const value = env[variable];
  return value === undefined || value === "" ? CONFIG_DEFAULTS[variable] : value;
}

function read<T>(env: Env, variable: ConfigVariable, schema: z.ZodType<T>, rule: string): T {
  const result = schema.safeParse(rawValue(env, variable));
  if (!result.success) throw new InvalidConfigError(variable, rule);
  return result.data;
}

/** The service's configuration from `process.env` (or a test's map); the first broken rule throws. */
export function loadConfig(env: Env): Config {
  const secret = read(
    env,
    "WORKSPACE_SERVICE_SECRET",
    z.string().min(SECRET_MIN_LENGTH),
    `required, at least ${SECRET_MIN_LENGTH} characters`,
  );
  const instance = read(
    env,
    "WORKSPACE_INSTANCE",
    z.string().regex(INSTANCE_PATTERN),
    `required, matches ${INSTANCE_PATTERN.source}`,
  );
  const host = read(env, "WORKSPACE_HOST", z.string().regex(/^\S+$/), "a host without spaces");
  const port = read(
    env,
    "WORKSPACE_PORT",
    integerText(1, MAX_TCP_PORT),
    `integer from 1 to ${MAX_TCP_PORT}`,
  );
  const courseRoot = read(
    env,
    "COURSE_ROOT",
    z.string().refine((path) => isAbsolute(path)),
    "required, an absolute path",
  );
  const image = rawValue(env, "WORKSPACE_IMAGE");
  const cpus = read(
    env,
    "WORKSPACE_CPU_LIMIT",
    cpuCount,
    `number from ${CPU_RANGE.min} to ${CPU_RANGE.max}`,
  );
  const memory = read(
    env,
    "WORKSPACE_MEMORY_LIMIT",
    memoryBytes,
    "digits followed by m or g, from 64m to 16g",
  );
  const pidsLimit = read(
    env,
    "WORKSPACE_PIDS_LIMIT",
    integerText(PIDS_RANGE.min, PIDS_RANGE.max),
    `integer from ${PIDS_RANGE.min} to ${PIDS_RANGE.max}`,
  );
  const idleStopMinutes = read(
    env,
    "ENVIRONMENT_IDLE_STOP_MINUTES",
    integerText(IDLE_STOP_MINUTES_RANGE.min, IDLE_STOP_MINUTES_RANGE.max),
    `integer from ${IDLE_STOP_MINUTES_RANGE.min} to ${IDLE_STOP_MINUTES_RANGE.max}`,
  );
  // The warning must come before the stop, so its upper bound is the other variable's value minus one.
  const idleWarningMinutes = read(
    env,
    "ENVIRONMENT_IDLE_WARNING_MINUTES",
    integerText(1, idleStopMinutes - 1),
    "integer from 1 to ENVIRONMENT_IDLE_STOP_MINUTES - 1",
  );
  const startSlowSeconds = read(
    env,
    "ENVIRONMENT_START_SLOW_SECONDS",
    integerText(START_SLOW_SECONDS_RANGE.min, START_SLOW_SECONDS_RANGE.max),
    `integer from ${START_SLOW_SECONDS_RANGE.min} to ${START_SLOW_SECONDS_RANGE.max}`,
  );
  return {
    secret,
    instance,
    host,
    port,
    courseRoot,
    imageOverride: image === undefined || image === "" ? null : image,
    limits: { nanoCpus: Math.round(cpus * NANOS_PER_CPU), memoryBytes: memory, pidsLimit },
    idleStopMinutes,
    idleWarningMinutes,
    startSlowSeconds,
  };
}
