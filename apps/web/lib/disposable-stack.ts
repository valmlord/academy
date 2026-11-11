// Whether the destructive e2e spec may run (#106 design 2.8, D8): e2e/environment-actions.spec.ts restarts and
// resets a working folder of the signed-in user, so it runs only on a disposable stack, never on the owner's,
// whatever the root .env holds. And where it must run, CI's terminal suite, a skip fails the run.
// Erasable syntax only (no enum, namespace or parameter property): playwright.config.ts imports this file by its
// .ts path, as it does lib/root-env.ts.

type Env = Record<string, string | undefined>;

export interface DestructiveE2eDecision {
  isAllowed: boolean;
  /** The first condition that failed, for the skip message; never a value of the environment. */
  reason: string;
}

export interface DestructiveE2eInput {
  /** The environment after the root .env was loaded into it. */
  env: Env;
  /** The names the root .env defines (readRootEnvKeys): a switch from the file does not count. */
  rootEnvKeys: readonly string[];
  /** The base URL the config computed, `E2E_BASE_URL` or the compose default. */
  baseURL: string;
}

// The compose web service's default WEB_PORT, the owner's stack unless he changed it.
const COMPOSE_DEFAULT_PORT = "3080";
// The one host a disposable stack listens on (isolated-stack.sh publishes its ports on 127.0.0.1 only).
const DISPOSABLE_HOST = "127.0.0.1";
const DECIMAL_PORT = /^[0-9]+$/;

const ALLOWED: DestructiveE2eDecision = { isAllowed: true, reason: "a disposable stack" };

function refused(reason: string): DestructiveE2eDecision {
  return { isAllowed: false, reason };
}

/** A non-empty `name` that came from the shell, not from the root .env. */
function isFromShell(env: Env, rootEnvKeys: readonly string[], name: string): boolean {
  const value = env[name];
  return value !== undefined && value !== "" && !rootEnvKeys.includes(name);
}

/** The origin refusals of condition 3, or null when the URL names a disposable origin. */
function originRefusal(url: URL, env: Env, rootEnvKeys: readonly string[]): string | null {
  if (url.protocol !== "http:") return "the base URL is not http";
  // After WHATWG parsing, so 127.1 folds to 127.0.0.1 while localhost and [::1] stay what they are.
  if (url.hostname !== DISPOSABLE_HOST) return `the base URL's host is not ${DISPOSABLE_HOST}`;
  if (url.port === "") return "the base URL names no port";
  if (url.port === COMPOSE_DEFAULT_PORT)
    return `the base URL's port is the compose default ${COMPOSE_DEFAULT_PORT}`;
  // Only a root .env WEB_PORT is the owner's: isolated-stack.sh puts its own stack port into WEB_PORT.
  if (rootEnvKeys.includes("WEB_PORT")) {
    const ownerPort = env.WEB_PORT;
    // Compared as integers, because compose reads WEB_PORT=04000 as port 4000; anything else fails closed.
    if (ownerPort === undefined || !DECIMAL_PORT.test(ownerPort)) {
      return "the root .env WEB_PORT is no decimal port";
    }
    if (Number(ownerPort) === Number(url.port))
      return "the base URL's port is the root .env WEB_PORT";
  }
  return null;
}

/** Allowed only with the switch and the base URL from the shell, and a disposable origin or CI from the shell. */
export function destructiveE2eDecision({
  env,
  rootEnvKeys,
  baseURL,
}: DestructiveE2eInput): DestructiveE2eDecision {
  if (env.E2E_DISPOSABLE_STACK !== "1" || rootEnvKeys.includes("E2E_DISPOSABLE_STACK")) {
    return refused("E2E_DISPOSABLE_STACK=1 is not set in the shell");
  }
  if (!isFromShell(env, rootEnvKeys, "E2E_BASE_URL")) {
    return refused("E2E_BASE_URL is not set in the shell");
  }
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    // An unparsable base URL names no stack at all, so nothing may run against it.
    return refused("the base URL does not parse");
  }
  // CI's throwaway compose stack is the one disposable stack on 3080.
  if (isFromShell(env, rootEnvKeys, "CI")) return ALLOWED;
  const refusal = originRefusal(url, env, rootEnvKeys);
  return refusal === null ? ALLOWED : refused(refusal);
}

export class DestructiveE2eSkippedInCiError extends Error {
  constructor(reason: string) {
    super(
      `CI runs the terminal suite (E2E_TERMINAL=1), but e2e/environment-actions.spec.ts would skip: ${reason}. ` +
        "Check that the ci.yml e2e step sets E2E_DISPOSABLE_STACK and E2E_BASE_URL, that turbo.json test:e2e " +
        "passThroughEnv lists both, and that the root .env (a copy of .env.example in CI) defines neither.",
    );
    this.name = "DestructiveE2eSkippedInCiError";
  }
}

export interface RequireInCiInput {
  env: Env;
  rootEnvKeys: readonly string[];
  decision: DestructiveE2eDecision;
}

/** Throws where the spec must run: CI from the shell runs the terminal suite, and the decision refused. */
export function requireDestructiveE2eInCi({ env, rootEnvKeys, decision }: RequireInCiInput): void {
  if (env.E2E_TERMINAL !== "1") return;
  if (!isFromShell(env, rootEnvKeys, "CI")) return;
  if (!decision.isAllowed) throw new DestructiveE2eSkippedInCiError(decision.reason);
}
