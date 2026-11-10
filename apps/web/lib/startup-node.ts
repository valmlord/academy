import { migrateDatabase } from "@academy/db";
import { migrateOnStartup } from "./startup";

// Node-only wiring of migrateOnStartup. #34 adds the stale-attempt sweep here, after the migration.
export async function runStartup(): Promise<void> {
  await migrateOnStartup({
    databaseUrl: process.env.DATABASE_URL,
    authEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_SECRETS: process.env.BETTER_AUTH_SECRETS,
    },
    workspaceEnv: {
      WORKSPACE_SERVICE_URL: process.env.WORKSPACE_SERVICE_URL,
      WORKSPACE_SERVICE_SECRET: process.env.WORKSPACE_SERVICE_SECRET,
      TERMINAL_RECONNECT_ATTEMPTS: process.env.TERMINAL_RECONNECT_ATTEMPTS,
      TERMINAL_RELAY_MAX_SECONDS: process.env.TERMINAL_RELAY_MAX_SECONDS,
      ENVIRONMENT_START_SLOW_SECONDS: process.env.ENVIRONMENT_START_SLOW_SECONDS,
    },
    migrate: (url) => migrateDatabase(url),
    exit: (code) => process.exit(code),
    logError: (line) => console.error(line),
    logInfo: (line) => console.log(line),
  });
}
