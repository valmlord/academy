// Web's settings for the workspace service and the terminal (#32 design 3.3, "Web configuration"). Kept free
// of the server-only marker so the startup check in instrumentation and the unit tests can import it. The
// check never contacts the service, so web starts while the service is down (ADR-0010 item 10 amended).
// Messages name the variable and the rule, never a value.

export interface WorkspaceServiceEnv {
  WORKSPACE_SERVICE_URL: string | undefined;
  WORKSPACE_SERVICE_SECRET: string | undefined;
  TERMINAL_RECONNECT_ATTEMPTS: string | undefined;
  TERMINAL_RELAY_MAX_SECONDS: string | undefined;
  ENVIRONMENT_START_SLOW_SECONDS: string | undefined;
}

export class InvalidWorkspaceServiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkspaceServiceConfigError";
  }
}

// The service refuses a shorter secret at its own startup (services/workspace/src/config.ts), so web holding
// one could never authenticate.
const SECRET_MIN_LENGTH = 32;

interface IntegerSetting {
  name:
    | "TERMINAL_RECONNECT_ATTEMPTS"
    | "TERMINAL_RELAY_MAX_SECONDS"
    | "ENVIRONMENT_START_SLOW_SECONDS";
  min: number;
  max: number;
  fallback: number;
}

// Ranges and defaults of design 3.3; compose passes the same defaults.
export const RECONNECT_ATTEMPTS: IntegerSetting = {
  name: "TERMINAL_RECONNECT_ATTEMPTS",
  min: 1,
  max: 20,
  fallback: 5,
};
export const RELAY_MAX_SECONDS: IntegerSetting = {
  name: "TERMINAL_RELAY_MAX_SECONDS",
  min: 120,
  max: 3600,
  fallback: 900,
};
// Seconds after which the lesson page says a start takes longer than usual (#32 Delta 2.1). Range and
// default are the service's (services/workspace/src/config.ts, ADR-0010 item 5), and compose passes the same
// variable to both containers, so web shows the service's threshold without asking the service first.
export const START_SLOW_SECONDS: IntegerSetting = {
  name: "ENVIRONMENT_START_SLOW_SECONDS",
  min: 1,
  max: 120,
  fallback: 10,
};

export type WorkspaceServiceConfig =
  | { kind: "configured"; baseUrl: URL; secret: string }
  | { kind: "unconfigured" };

function isUnset(value: string | undefined): value is undefined | "" {
  return value === undefined || value === "";
}

/**
 * Where web reaches the service, or `unconfigured` when `WORKSPACE_SERVICE_URL` is unset (`pnpm dev`, where the
 * terminal shows "start failed"). Throws `InvalidWorkspaceServiceConfigError` for a URL that is not `http:` or a
 * secret shorter than the service accepts.
 */
export function readWorkspaceServiceConfig(env: WorkspaceServiceEnv): WorkspaceServiceConfig {
  const url = env.WORKSPACE_SERVICE_URL;
  if (isUnset(url)) return { kind: "unconfigured" };
  let baseUrl: URL;
  try {
    baseUrl = new URL(url);
  } catch {
    throw new InvalidWorkspaceServiceConfigError("WORKSPACE_SERVICE_URL must be an http: URL");
  }
  if (baseUrl.protocol !== "http:") {
    throw new InvalidWorkspaceServiceConfigError("WORKSPACE_SERVICE_URL must be an http: URL");
  }
  const secret = env.WORKSPACE_SERVICE_SECRET;
  if (secret === undefined || secret.length < SECRET_MIN_LENGTH) {
    throw new InvalidWorkspaceServiceConfigError(
      `WORKSPACE_SERVICE_SECRET must be at least ${SECRET_MIN_LENGTH} characters when WORKSPACE_SERVICE_URL is set`,
    );
  }
  return { kind: "configured", baseUrl, secret };
}

/** The setting's value, its default when unset; throws for anything but an integer in its range. */
export function readIntegerSetting(
  env: Partial<Pick<WorkspaceServiceEnv, IntegerSetting["name"]>>,
  setting: IntegerSetting,
): number {
  const raw = env[setting.name];
  if (isUnset(raw)) return setting.fallback;
  const value = /^[0-9]{1,6}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(value >= setting.min && value <= setting.max)) {
    throw new InvalidWorkspaceServiceConfigError(
      `${setting.name} must be an integer from ${setting.min} to ${setting.max}`,
    );
  }
  return value;
}

/** Startup check of every variable above; throws `InvalidWorkspaceServiceConfigError` on the first refusal. */
export function checkWorkspaceServiceEnv(env: WorkspaceServiceEnv): void {
  readWorkspaceServiceConfig(env);
  readIntegerSetting(env, RECONNECT_ATTEMPTS);
  readIntegerSetting(env, RELAY_MAX_SECONDS);
  readIntegerSetting(env, START_SLOW_SECONDS);
}
