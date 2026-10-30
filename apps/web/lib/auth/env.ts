// ADR-0008 item 9. Better Auth itself falls back to a public default secret outside production and
// lets BETTER_AUTH_SECRETS replace the configured secret with only a warning, so the app checks the
// environment itself, in every mode. Messages name the variable and the rule, never a value.

export interface AuthSecretEnv {
  BETTER_AUTH_SECRET: string | undefined;
  BETTER_AUTH_SECRETS: string | undefined;
}

export class InvalidAuthSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAuthSecretError";
  }
}

// Better Auth 1.7.14's built-in fallback (dist/context/create-context.mjs), public in its source.
const BETTER_AUTH_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";
// Better Auth warns below 32 characters; ADR-0008 makes it a hard rule.
const MIN_SECRET_LENGTH = 32;

/** The validated `BETTER_AUTH_SECRET`; throws `InvalidAuthSecretError` for any refused value. */
export function readAuthSecret(env: AuthSecretEnv): string {
  // First, so this message never depends on the other variable.
  if (env.BETTER_AUTH_SECRETS !== undefined && env.BETTER_AUTH_SECRETS !== "") {
    throw new InvalidAuthSecretError(
      "BETTER_AUTH_SECRETS is not supported; set BETTER_AUTH_SECRET only",
    );
  }
  const secret = env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret === "") {
    throw new InvalidAuthSecretError("BETTER_AUTH_SECRET is missing");
  }
  if (secret === BETTER_AUTH_DEFAULT_SECRET) {
    throw new InvalidAuthSecretError("BETTER_AUTH_SECRET is Better Auth's public default");
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new InvalidAuthSecretError(
      `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters, got ${secret.length}`,
    );
  }
  return secret;
}
