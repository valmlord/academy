import {
  InvalidConnectionStringError,
  InvalidLockTimeoutError,
  InvalidMigrationsFolderError,
  MigrationError,
} from "@academy/db";
import { type AuthSecretEnv, InvalidAuthSecretError, readAuthSecret } from "./auth/env";
import {
  checkWorkspaceServiceEnv,
  InvalidWorkspaceServiceConfigError,
  type WorkspaceServiceEnv,
} from "./workspace/env";

export interface StartupDeps {
  databaseUrl: string | undefined;
  authEnv: AuthSecretEnv;
  workspaceEnv: WorkspaceServiceEnv;
  migrate: (url: string) => Promise<void>;
  exit: (code: number) => never;
  logError: (line: string) => void;
  logInfo: (line: string) => void;
}

// True for every connect failure (refused, unknown host, wrong password), so it is printed only for
// stage connect: on lock or apply the database is up, and this hint would point at the wrong layer.
// It names both cases because the same text is printed in the compose web container and by host processes
// (pnpm dev, pnpm seed), which reach db only through the opt-in port of compose.db-port.yaml (ADR-0002
// item 6). check-image-migrations.sh (I2) greps the COMPOSE_FILE part: change both together.
export const connectHint =
  "check that the database is running and DATABASE_URL points at it (docker compose up -d --wait db; from the host, export COMPOSE_FILE=docker-compose.yml:compose.db-port.yaml before that command)";

// An error's name is as untrusted as its message (any value can claim one): only an identifier is
// printed, so a name that carries the URL cannot leak it.
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

/**
 * Checks the auth secret, then applies the database migrations before the server handles a request,
 * and exits the process on any failure: a server without its schema would answer 500 forever
 * (ADR-0007 item 8), and one without a valid secret would sign sessions with a guessable key
 * (ADR-0008 item 9). The workspace service settings are checked as values only, never by contacting the
 * service, so web starts while the service is down (ADR-0010 item 10 amended). No log line ever carries the
 * connection string or a secret.
 */
export async function migrateOnStartup(deps: StartupDeps): Promise<void> {
  if (deps.databaseUrl === undefined || deps.databaseUrl === "") {
    deps.logError(
      "web: DATABASE_URL is not set; start with the repository .env (pnpm dev) or the compose environment",
    );
    deps.exit(1);
  }
  try {
    readAuthSecret(deps.authEnv);
  } catch (error: unknown) {
    if (!(error instanceof InvalidAuthSecretError)) throw error;
    deps.logError(`web: ${error.name}: ${error.message}`);
    deps.exit(1);
  }
  try {
    checkWorkspaceServiceEnv(deps.workspaceEnv);
  } catch (error: unknown) {
    if (!(error instanceof InvalidWorkspaceServiceConfigError)) throw error;
    deps.logError(`web: ${error.name}: ${error.message}`);
    deps.exit(1);
  }
  try {
    await deps.migrate(deps.databaseUrl);
  } catch (error: unknown) {
    deps.logError(`web: database migration failed: ${describeFailure(error)}`);
    deps.exit(1);
  }
  deps.logInfo("web: database migrations applied");
}

function describeFailure(error: unknown): string {
  if (error instanceof MigrationError) {
    const hint = error.stage === "connect" ? `; ${connectHint}` : "";
    return `${safeName(error)} stage ${error.stage}: ${error.message}${hint}`;
  }
  // @academy/db guarantees these messages free of the connection string (ADR-0007 item 9).
  if (
    error instanceof InvalidConnectionStringError ||
    error instanceof InvalidLockTimeoutError ||
    error instanceof InvalidMigrationsFolderError
  ) {
    return `${safeName(error)}: ${error.message}`;
  }
  // Any other value may carry the URL in its message, cause or stack: its name only.
  return safeName(error);
}

function safeName(error: unknown): string {
  return error instanceof Error && IDENTIFIER.test(error.name) ? error.name : "unknown";
}
